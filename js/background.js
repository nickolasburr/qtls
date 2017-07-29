(function () {
	'use strict';

	/**
	 * Chrome debugger protocol version
	 */
	var CDP_VERSION = '1.2';

	var Utils = {};

	// Coerce `value` to string
	Utils.toString = function (value) {
		return ('' + value);
	};

	// Coerce `value` to number
	Utils.toNumber = function (value) {
		return +(value);
	};

	// Coerce `value` to boolean
	Utils.toBool = function (value) {
		return !!(value);
	};

	// Get primitive type of `value`
	Utils.getType = function (value) {
		return (typeof value);
	};

	// Get object keys
	Utils.getKeys = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.getKeys` -> Argument must be an object, not a(n) ' + this.getType(obj));
		}

		return Object.keys(obj);
	};

	/**
	 * Determine if `obj` is of type 'object'
	 *
	 * @note This is a *very* loose check on the type 'object', e.g.
	 * this will return true for an object literal, object instance,
	 * array literal, array instance, HTMLElement, and so on...
	 */
	Utils.isObject = function (obj) {
		return this.toBool(obj instanceof Object);
	};

	/**
	 * Determine if `obj` is an object constructed from the native
	 * 'Object' prototype and not a different type of object constructor
	 */
	Utils.isNativeObject = function (obj) {
		return this.toBool(obj instanceof Object && Object.getPrototypeOf(obj).constructor.name === 'Object');
	};

	// Determine if object is empty or not
	Utils.isObjectEmpty = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.isObjectEmpty` -> Argument must be an object, not a(n) ' + this.getType(obj));
		}

		return !this.getKeys(obj).length;
	};

	// Determine if `arr` implements Array interface
	Utils.isArray = function (arr) {
		return this.toBool(arr instanceof Array);
	};

	// Determine if `needle` is in `haystack`
	Utils.inArray = function (needle, haystack) {
		if (!this.isArray(haystack)) {
			throw new TypeError('`Utils.inArray` -> `haystack` must be an array, not a(n) ' + this.getType(haystack));
		}

		return this.toBool(haystack.indexOf(needle) > -1);
	};

	// Determine if `element` is a valid HTMLElement object
	Utils.isElement = function (element) {
		return this.toBool(element instanceof HTMLElement);
	};

	// Determine if `func` is a Function
	Utils.isFunc = function (func) {
		return this.toBool(this.getType(func) === 'function' && func instanceof Function);
	};

	/**
	 * Background getter/setter methods
	 */

	var Background = Object.create(Utils);

	// `chrome.runtime.onMessage` event handler
	Background.onMessage = function (message, sender) {
		if (message.from !== 'metrics') {
			throw new Error('Cannot accept messages from unknown sources!');
		}

		// Set the active tab, attach the debugger to the active tab
		this.queryTabs((tab) => {
			var tabId  = tab.id,
			    tabUrl = tab.url;

			// Attach `chrome.debugger.onEvent` event listener
			chrome.debugger.onEvent.addListener(this.onNetworkEvent);

			// Set active tab object, query the available debugger targets
			this.setTab(tab).queryTargets((targets) => {
				// Set the available debugger targets, get the target for the active tab
				this.setTargets(targets).queryTarget('page', (target) => {
					var tabInfo = {
					      tabId: tabId
					    },
					    message = {
					      from:   'background',
					      reason: 'error'
					    };

					// If `target` is attachable, then attach Debugger instance to the Debuggee
					if (!target.attached) {
						chrome.debugger.attach(tabInfo, CDP_VERSION, function () {
							// Disable cached responses from being served
							chrome.debugger.sendCommand(tabInfo, 'Network.setCacheDisabled', { cacheDisabled: true });
							chrome.debugger.sendCommand(tabInfo, 'Network.enable');
							chrome.tabs.sendMessage(tabId, { from: 'background', url: tabUrl });
						});
					// Otherwise, send an error message to metrics.js
					} else {
						chrome.runtime.sendMessage(message);
					}
				});
			});
		});
	};

	// `chrome.debugger.onEvent` network event handler
	Background.onNetworkEvent = function (tab, type, event) {
		if (type === 'Network.responseReceived') {
			var tabId   = tab.tabId,
			    message = {
			      from:   'background',
			      reason: 'success',
			      event:  event,
			      tabId:  tabId
			    };

			chrome.runtime.sendMessage(message);
			chrome.debugger.onEvent.removeListener(Background.onNetworkEvent);
			chrome.debugger.detach({ tabId: tabId });
		}

		return this;
	};

	// Get active tab object
	Background.getTab = function () {
		return this.tab;
	};

	// Set active tab object
	Background.setTab = function (tab) {
		this.tab = tab;
		return this;
	};

	// Query `chrome.tabs` for currently active tabs,
	// get the active tab in the focused window, and
	// provide an optional callback function to the caller
	Background.queryTabs = function (optionalCallback) {
		optionalCallback = optionalCallback || function () {};

		if (!this.isFunc(optionalCallback)) {
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

	// Get all targets available to `chrome.debugger`
	Background.getTargets = function () {
		return this.targets;
	};

	// Set all targets available to `chrome.debugger`
	Background.setTargets = function (targets) {
		this.targets = targets;
		return this;
	};

	// Query `chrome.debugger` to retrieve available targets,
	// provide an optional callback function to the caller
	Background.queryTargets = function (optionalCallback) {
		optionalCallback = optionalCallback || function () {};

		if (!this.isFunc(optionalCallback)) {
			throw new TypeError('`Background.queryTargets` -> `optionalCallback` must be a function!');
		}

		chrome.debugger.getTargets((targets) => {
			optionalCallback(targets);
		});

		return this;
	};

	// Get TargetInfo for the active tab
	Background.getTarget = function () {
		return this.target;
	};

	// Set TargetInfo for the active tab
	Background.setTarget = function (target) {
		this.target = target;
		return this;
	};

	// Query available targets for TargetInfo object of the currently
	// active tab, provide optional callback function to the caller
	Background.queryTarget = function (type, callback) {
		var tabId   = this.getTab().id,
		    targets = this.getTargets();

		// If `type` isn't a string, throw a TypeError
		if (!(type && this.getType(type) === 'string')) {
			throw new TypeError('`Background.queryTarget` -> `type` must be a string, not a(n) ' + this.getType(type));
		}

		// If `callback` is not a function, throw a TypeError
		if (!this.isFunc(callback)) {
			throw new TypeError('`Background.queryTarget` -> `callback` must be a function, not a(n) ' + this.getType(callback));
		}

		// If `targets` is undefined, throw a TypeError
		if (!targets) {
			throw new TypeError('`Background.queryTarget` -> `targets` is not defined!');
		}

		var len = targets.length;

		for (var i = 0; i < len; i += 1) {
			var target = targets[i];

			// If `target` is of corresponding type `type` and has the same tab ID
			if (target.type === type && target.tabId === tabId) {
				callback(target);
			}
		}

		return this;
	};

	// Make sure `Background.onMessage` is properly bound
	var onMessage = Background.onMessage.bind(Background);
	// Attach `chrome.runtime.onMessage` event listener
	chrome.runtime.onMessage.addListener(onMessage);
}).call(this);
