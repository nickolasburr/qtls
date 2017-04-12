(function () {
	// debugger protocol version
	var CDP_VERSION = '1.2';

	// segmented namespace
	var Background = {};

	// `chrome.runtime.onMessage` event handler
	Background.onMessage = function (message, sender) {
		if (message.from !== 'metrics') {
			throw new Error('Cannot accept messages from unknown sources!');
		}
		// set the active tab, attach the debugger to the active tab
		Background.setTab(function (tab) {
			var tabId  = tab.id,
			    tabUrl = tab.url;
			// attach `chrome.debugger.onEvent` event listener
			chrome.debugger.onEvent.addListener(Background.onNetworkEvent);
			// set the available debugger targets
			Background.setTargets(function (targets) {
				// get TargetInfo structure for active tab
				var target  = Background.setTarget(targets).getTarget(),
				    message = {
				      from:   'background',
				      reason: 'error'
				    };
				// if `target` is attachable, then attach the Debugger instance to the Debuggee
				if (!target.attached) {
					chrome.debugger.attach({ tabId: tabId }, CDP_VERSION, function () {
						// disable cached responses from being served
						chrome.debugger.sendCommand({ tabId: tabId }, 'Network.setCacheDisabled', { cacheDisabled: true });
						chrome.debugger.sendCommand({ tabId: tabId }, 'Network.enable');
						chrome.debugger.sendCommand({ tabId: tabId }, 'Page.reload');
					});
				// otherwise, send an error message to metrics.js
				} else {
					chrome.runtime.sendMessage(message);
				}
			});
		});
	};

	// `chrome.debugger.onEvent` network event handler
	Background.onNetworkEvent = function (tab, type, event) {
		if (type === 'Network.responseReceived' && event.type === 'Document') {
			var message = {
			  from:   'background',
			  reason: 'success',
			  event:  event
			};
			chrome.runtime.sendMessage(message);
			chrome.debugger.onEvent.removeListener(Background.onNetworkEvent);
			chrome.debugger.detach({ tabId: tab.tabId });
		}
		return this;
	};

	/**
	 * Background getter/setter methods
	 */

	// get active tab object
	Background.getTab = function () {
		return this.tab;
	};

	// set active tab object, and provide an optional callback function
	Background.setTab = function (optionalCallback) {
		optionalCallback = optionalCallback || function () {};
		if (typeof optionalCallback !== 'function') {
			throw new TypeError('`Background.setTab` -> `optionalCallback` must be a function!');
		}
		chrome.tabs.query({ active: true }, (tabs) => {
			this.tab = tabs[0];
			optionalCallback(this.tab);
		});
		return this;
	};

	// get all targets available to `chrome.debugger`
	Background.getTargets = function () {
		return this.targets;
	};

	// set all targets available to `chrome.debugger`,
	// and provide an optional callback function
	Background.setTargets = function (optionalCallback) {
		optionalCallback = optionalCallback || function () {};
		if (typeof optionalCallback !== 'function') {
			throw new TypeError('`Background.setTargets` -> `optionalCallback` must be a function!');
		}
		chrome.debugger.getTargets((targets) => {
			this.targets = targets;
			optionalCallback(this.targets);
		});
		return this;
	};

	// get TargetInfo data structure for the active tab
	Background.getTarget = function () {
		return this.target;
	};

	// set TargetInfo data structure for the active tab
	Background.setTarget = function (targets, type) {
		targets = targets || this.getTargets();
		type    = type    || 'page';
		var tabId = this.getTab().id;
		// if `targets` is undefined, throw a TypeError
		if (!targets) {
			throw new TypeError('`Background.setTarget` -> `targets` is not defined!');
		}
		var len = targets.length;
		for (var i = 0; i < len; i += 1) {
			var target = targets[i];
			// if `target` is of corresponding type `type` and has the same tab ID
			if (target.type === type && target.tabId === tabId) {
				this.target = target;
			}
		}
		return this;
	};

	// attach `chrome.runtime.onMessage` event listener
	chrome.runtime.onMessage.addListener(Background.onMessage);
}).call(this);
