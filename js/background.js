(function () {
	'use strict';

	// chrome debugger protocol version
	var CDP_VERSION = '1.2';

	// segmented namespace
	var Background = {},
	    Utils      = {};

	/**
	 * Utility, convenience methods
	 */

	// coerce `value` to string
	Utils.toString = function (value) {
		return ('' + value);
	};

	// coerce `value` to number
	Utils.toNumber = function (value) {
		return +(value);
	};

	// coerce `value` to boolean
	Utils.toBoolean = function (value) {
		return !!(value);
	};

	// get primitive type of `value`
	Utils.getType = function (value) {
		return (typeof value);
	};

	// get object keys
	Utils.getKeys = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.getKeys` -> Argument must be an object, not a(n) ' + this.getType(obj));
		}
		return Object.keys(obj);
	};

	/**
	 * determine if `obj` is of type 'object'
	 *
	 * @note this is a *very* loose check on the type 'object', e.g.
	 * this will return true for an object literal, object instance,
	 * array literal, array instance, HTMLElement, and so on...
	 */
	Utils.isObject = function (obj) {
		return this.toBoolean(obj instanceof Object);
	};

	/**
	 * determine if `obj` is an object constructed from the native
	 * 'Object' prototype and not a different type of object constructor
	 */
	Utils.isNativeObject = function (obj) {
		return this.toBoolean(obj instanceof Object && obj.__proto__.constructor.name === 'Object');
	};

	// determine if object is empty or not
	Utils.isObjectEmpty = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.isObjectEmpty` -> Argument must be an object, not a(n) ' + this.getType(obj));
		}
		return !this.getKeys(obj).length;
	};

	// determine if `arr` implements Array interface
	Utils.isArray = function (arr) {
		return this.toBoolean(arr instanceof Array);
	};

	// determine if `needle` is in `haystack`
	Utils.inArray = function (needle, haystack) {
		if (!this.isArray(haystack)) {
			throw new TypeError('`Utils.inArray` -> `haystack` must be an array, not a(n) ' + this.getType(haystack));
		}
		return this.toBoolean(haystack.indexOf(needle) > -1);
	};

	// determine if `element` is a valid HTMLElement object
	Utils.isElement = function (element) {
		return this.toBoolean(element instanceof HTMLElement);
	};

	// determine if `func` is a Function
	Utils.isFunction = function (func) {
		return this.toBoolean(this.getType(func) === 'function' && func instanceof Function);
	};

	/**
	 * Background getter/setter methods
	 */

	// `chrome.runtime.onMessage` event handler
	Background.onMessage = function (message, sender) {
		if (message.from !== 'metrics') {
			throw new Error('Cannot accept messages from unknown sources!');
		}
		// set the active tab, attach the debugger to the active tab
		this.queryTabs((tab) => {
			var tabId  = tab.id,
			    tabUrl = tab.url;
			// attach `chrome.debugger.onEvent` event listener
			chrome.debugger.onEvent.addListener(this.onNetworkEvent);
			// set active tab object, query the available debugger targets
			this.setTab(tab).queryTargets((targets) => {
				// set the available debugger targets, get the target for the active tab
				this.setTargets(targets).queryTarget('page', (target) => {
					var tabInfo = {
					      tabId: tabId
					    },
					    message = {
					      from:   'background',
					      reason: 'error'
					    };
					// if `target` is attachable, then attach the Debugger instance to the Debuggee
					if (!target.attached) {
						chrome.debugger.attach(tabInfo, CDP_VERSION, function () {
							// disable cached responses from being served
							chrome.debugger.sendCommand(tabInfo, 'Network.setCacheDisabled', { cacheDisabled: true });
							chrome.debugger.sendCommand(tabInfo, 'Network.enable');
							chrome.debugger.sendCommand(tabInfo, 'Page.reload');
						});
					// otherwise, send an error message to metrics.js
					} else {
						chrome.runtime.sendMessage(message);
					}
				});
			});
		});
	};

	// `chrome.debugger.onEvent` network event handler
	Background.onNetworkEvent = function (tab, type, event) {
		if (type === 'Network.responseReceived' && event.type === 'Document') {
			var tabId   = tab.tabId,
			    message = {
			      from:   'background',
			      reason: 'success',
			      event:  event,
			      tabId: tabId
			    };
			chrome.runtime.sendMessage(message);
			chrome.debugger.onEvent.removeListener(Background.onNetworkEvent);
			chrome.debugger.detach({ tabId: tabId });
		}
		return this;
	};

	// get active tab object
	Background.getTab = function () {
		return this.tab;
	};

	// set active tab object
	Background.setTab = function (tab) {
		this.tab = tab;
		return this;
	};

	// query `chrome.tabs` for currently active tabs,z
	// get the active tab in the focused window and
	// provide an optional callback function to the caller
	Background.queryTabs = function (optionalCallback) {
		optionalCallback = optionalCallback || function () {};
		if (!Utils.isFunction(optionalCallback)) {
			throw new TypeError('`Background.queryTabs` -> `optionalCallback` must be a function!');
		}
		var queryInfo = {
			active: true,
			currentWindow: true
		};
		chrome.tabs.query(queryInfo, (tabs) => {
			optionalCallback(tabs[0]);
		});
		return this;
	};

	// get all targets available to `chrome.debugger`
	Background.getTargets = function () {
		return this.targets;
	};

	// set all targets available to `chrome.debugger`
	Background.setTargets = function (targets) {
		this.targets = targets;
		return this;
	};

	// query `chrome.debugger` to retrieve available targets,
	// provide an optional callback function to the caller
	Background.queryTargets = function (optionalCallback) {
		optionalCallback = optionalCallback || function () {};
		if (!Utils.isFunction(optionalCallback)) {
			throw new TypeError('`Background.queryTargets` -> `optionalCallback` must be a function!');
		}
		chrome.debugger.getTargets((targets) => {
			optionalCallback(targets);
		});
		return this;
	};

	// get TargetInfo for the active tab
	Background.getTarget = function () {
		return this.target;
	};

	// set TargetInfo for the active tab
	Background.setTarget = function (target) {
		this.target = target;
		return this;
	};

	// query available targets for TargetInfo object of the currently
	// active tab, provide optional callback function to the caller
	Background.queryTarget = function (type, callback) {
		var tabId   = this.getTab().id,
		    targets = this.getTargets();
		// if `type` isn't a string, throw a TypeError
		if (!(type && Utils.getType(type) === 'string')) {
			throw new TypeError('`Background.queryTarget` -> `type` must be a string, not a(n) ' + Utils.getType(type));
		}
		// if `callback` is not a function, throw a TypeError
		if (!Utils.isFunction(callback)) {
			throw new TypeError('`Background.queryTarget` -> `callback` must be a function, not a(n) ' + Utils.getType(callback));
		}
		// if `targets` is undefined, throw a TypeError
		if (!targets) {
			throw new TypeError('`Background.queryTarget` -> `targets` is not defined!');
		}
		var len = targets.length;
		for (var i = 0; i < len; i += 1) {
			var target = targets[i];
			// if `target` is of corresponding type `type` and has the same tab ID
			if (target.type === type && target.tabId === tabId) {
				callback(target);
			}
		}
		return this;
	};

	// make sure `Background.onMessage` is properly bound
	var onMessage = Background.onMessage.bind(Background);
	// attach `chrome.runtime.onMessage` event listener
	chrome.runtime.onMessage.addListener(onMessage);
}).call(this);
