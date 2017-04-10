(function () {
	var CDP_VERSION = '1.2';
	// segmented namespace
	var Background = {};

	// `chrome.runtime.onMessage` event handler
	Background.onMessage = function (message, sender) {
		if (message.from !== 'stats') {
			throw new Error('Cannot accept messages from unknown sources!');
		}
		// set the active tab, attach the debugger to the active tab
		Background.setTab(function (tab) {
			var tabId   = tab.id,
			    tabUrl  = tab.url;
			chrome.debugger.onEvent.addListener(Background.onNetworkEvent);
			chrome.debugger.attach({ tabId: tabId }, CDP_VERSION, function () {
				chrome.debugger.sendCommand({ tabId: tabId }, 'Network.setCacheDisabled', { cacheDisabled: true });
				chrome.debugger.sendCommand({ tabId: tabId }, 'Network.enable');
				chrome.debugger.sendCommand({ tabId: tabId }, 'Page.reload');
			});
		});
	};

	Background.onNetworkEvent = function (tab, type, event) {
		var lnand = !(type === 'Network.responseReceived' && event.type === 'Document');
		if (lnand) {
			return;
		}
		chrome.runtime.sendMessage({ from: 'background', task: 'response', event: event });
		chrome.debugger.onEvent.removeListener(Background.onNetworkEvent);
		chrome.debugger.detach({ tabId: tab.tabId });
	};

	/**
	 * Background getter/setter methods
	 */

	Background.getTab = function () {
		return this.tab;
	};

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

	// attach `chrome.runtime.onMessage` event listener
	chrome.runtime.onMessage.addListener(Background.onMessage);
}).call(this);
