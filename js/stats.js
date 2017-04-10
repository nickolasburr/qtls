(function () {
	// stats & metrics whitelist by type
	var CERTIFICATE_DETAILS_WHITELIST = [
		'issuer', 'sanList', 'subjectName',
		'validFrom', 'validTo'
	],
	CONNECTION_DETAILS_WHITELIST = [
		'mimeType', 'protocol', 'remoteIPAddress',
		'remotePort', 'status', 'statusText', 'url'
	],
	KEY_EXCHANGE_DETAILS_WHITELIST = [
		'cipher', 'keyExchange',
		'keyExchangeGroup', 'protocol'
	];

	// abbreviated months of the year, listed in zero-index array
	var ABBR_MONTHS_OF_YEAR = [
		'Jan', 'Feb', 'Mar',
		'Apr', 'May', 'Jun',
		'Jul', 'Aug', 'Sept',
		'Oct', 'Nov', 'Dec'
	];

	// common HTTP status codes and their definitions
	var HTTP_STATUS_CODES = {
		'200': 'OK',
		'301': 'Moved Permanently',
		'302': 'Found',
		'304': 'Not Modified',
		'307': 'Temporary Redirect',
		'400': 'Bad Request',
		'401': 'Unauthorized',
		'403': 'Forbidden',
		'404': 'Not Found',
		'405': 'Method Not Allowed',
		'500': 'Internal Server Error',
		'502': 'Bad Gateway',
		'503': 'Service Unavailable',
		'504': 'Gateway Time-out'
	};

	// segmented namespaces
	var Stats = {},
	    Utils = {};

	/**
	 * Utility, convenience methods
	 */

	// coerce `value` to string
	Utils.toString = function (value) {
		return String(value);
	};

	// coerce `value` to number
	Utils.toNumber = function (value) {
		return +value;
	};

	/**
	 * determine if `obj` is of type 'object'
	 *
	 * @note this is a very loose check on the type 'object',
	 * meaning this could be an object literal, object instance
	 * array literal, array instance, etc.
	 */
	Utils.isObject = function (obj) {
		if (obj instanceof Object) {
			return true;
		}
		return false;
	};

	/**
	 * determine if `obj` is an object constructed from the native
	 * 'Object' prototype and not a different type of object prototype
	 */
	 Utils.isObjectNative = function (obj) {
	 	if (obj instanceof Object && obj.__proto__.constructor.name === 'Object') {
	 		return true;
	 	}
	 	return false;
	 };

	// determine if object is empty or not
	Utils.isObjectEmpty = function (obj) {
		if (typeof obj !== 'object') {
			throw new TypeError('Argument must be an object, not a ' + typeof obj);
		}
		return !Object.keys(obj).length;
	};

	// determine if object is an array
	Utils.isArray = function (obj) {
		if (obj instanceof Array) {
			return true;
		}
		return false;
	};

	// determine if `needle` is in array `haystack`
	Utils.inArray = function (needle, haystack) {
		if (!this.isArray(haystack)) {
			throw new TypeError('`Utils.inArray` -> `haystack` must be an array, not a ' + typeof haystack);
		}
		if (haystack.indexOf(needle) > -1) {
			return true;
		}
		return false;
	};

	// filter object properties via whitelist of keys
	Utils.toFilterObject = function (obj, whitelist) {
		whitelist = whitelist || [];
		var fObj = {};
		// `obj` must be a native object, otherwise throw a TypeError
		if (!this.isObjectNative(obj)) {
			throw new TypeError('`Utils.toFilterObject` -> `obj` must be a native object!');
		}
		// `whitelist` must be an array, otherwise throw a TypeError
		if (!this.isArray(whitelist)) {
			throw new TypeError('`Utils.toFilterObject` -> `whitelist` must be an array!');
		}
		var keys = Object.keys(obj),
		    len  = keys.length;
		// remove unwanted properties from `obj`
		for (var i = 0; i < len; i += 1) {
			var key = keys[i];
			if (this.inArray(key, whitelist)) {
				fObj[key] = obj[key];
			}
		}
		return fObj;
	};

	/**
	 * Stats & metrics methods
	 */

	// `load` event handler
	Stats.onLoad = function () {
		var onMessage = Stats.onMessage.bind(Stats);
		chrome.runtime.onMessage.addListener(onMessage);
		chrome.runtime.sendMessage({ from: 'stats', task: 'request' });
	};

	// `chrome.runtime.onMessage` event handler
	Stats.onMessage = function (message, sender) {
		if (message.from !== 'background') {
			throw new Error('Cannot accept messages from unknown sources!');
		}
		// set network event object, hide loader and set stats data in popup
		this.setNetworkEvent(message.event)
		    .toHideLoader()
		    .toDisplayStats();
	};

	/**
	 * Ad-hoc action methods, written for their side effects and not suitable for template reuse.
	 *
	 * Conventions are as follows: Methods that start with `to` are pseudo-setters, they make
	 * modifications to the DOM and return the main instance object (e.g. `Stats`). Methods that
	 * start with `unto` are pseudo-getters, they create something useful for pseudo-setters, and
	 * return that useful something to the caller (e.g. a node with data to be inserted in the DOM)
	 */

	// display notice that metrics and stats aren't available
	Stats.toDisplayNotice = function () {
		var container = document.querySelector('.container'),
		    title     = document.createElement('div'),
		    message   = document.createElement('div');
		// add notice title to `title` element
		title.textContent = 'We\'re sorry...';
		title.setAttribute('class', 'notice-title');
		// add notice text to `message` element
		message.textContent = 'Metrics & statistics are only available to pages served over a secure HTTPS connection.';
		message.setAttribute('class', 'notice-message');
		// append `title` and `message` to `container`
		this.toAppendNodes(container, [title, message]);
		return this;
	};

	// hide loading icon upon receiving data
	Stats.toHideLoader = function () {
		var loader = document.querySelector('[name="loading"]');
		if (loader) {
			loader.setAttribute('style', 'display: none !important');
		}
		return this;
	};

	// append nodes in `children` array to node `parent`
	Stats.toAppendNodes = function (parent, children) {
		var len = children.length;
		for (var i = 0; i < len; i += 1) {
			var child = children[i];
			parent.appendChild(child);
		}
		return this;
	};

	// display stats and metrics in stats.html popup
	Stats.toDisplayStats = function () {
		// if the state is not secure, display a notice to the user in stats.html popup
		if (!this.isStateSecure()) {
			this.toDisplayNotice();
			return this;
		}
		// if our `.main` container exists (stats have already been displayed), just return
		if (document.querySelector('.main')) {
			return this;
		}
		// otherwise, get the certificate and exchange details and display in stats.html popup
		var statsContainer     = document.querySelector('.container'),
		    mainWrapper        = document.createElement('div'),
		    responseDetails    = this.getResponse(),
		    securityDetails    = this.getSecurityDetails(),
		    certificateDetails = Utils.toFilterObject(securityDetails, CERTIFICATE_DETAILS_WHITELIST),
		    certificateBlock   = this.untoMakeSection(certificateDetails, 'Certificate', true),
		    connectionDetails  = Utils.toFilterObject(responseDetails, CONNECTION_DETAILS_WHITELIST),
		    connectionBlock    = this.untoMakeSection(connectionDetails, 'Connection', true),
		    keyExchangeDetails = Utils.toFilterObject(securityDetails, KEY_EXCHANGE_DETAILS_WHITELIST),
		    keyExchangeBlock   = this.untoMakeSection(keyExchangeDetails, 'Key Exchange', true);
		// set `class` attribute on `mainWrapper`
		mainWrapper.setAttribute('class', 'main');
		// append `mainWrapper` to `statsContainer`
		statsContainer.appendChild(mainWrapper);
		// append block section(s) to `mainWrapper` element
		this.toAppendNodes(mainWrapper, [certificateBlock, connectionBlock, keyExchangeBlock]);
		return this;
	};

	// create a `<section>` block element with given data
	Stats.untoMakeSection = function (data, title) {
		// if `data` isn't an object, throw a TypeError
		if (typeof data !== 'object') {
			throw new TypeError('`Stats.untoMakeSection` -> `data` must be an object!');
		}
		var section = document.createElement('section'),
		    heading = document.createElement('h4'),
		    preWrap = document.createElement('pre'),
		    rawCode = document.createElement('code'),
		    keys    = Object.keys(data),
		    len     = keys.length;
		// set heading title text on `heading` element
		heading.textContent = title;
		// append `heading` element to `section` element
		section.appendChild(heading);
		// append `rawCode` element to `preWrap` element
		preWrap.appendChild(rawCode);
		// append `preWrap` element to `section` element
		section.appendChild(preWrap);
		for (var i = 0; i < len; i += 1) {
			var key   = keys[i],
			    value = data[key];
			// make sure the proper HTTP status code is always present
			if (!value && key === 'statusText') {
				value = !HTTP_STATUS_CODES[Utils.toString(data['status'])]
				      ? 'Unavailable'
				      : HTTP_STATUS_CODES[Utils.toString(data['status'])];
			}
			// convert timestamps to local time
			if (key === 'validFrom' || key === 'validTo') {
				var validPoint = new Date(value * 1000),
				    validMonth = ABBR_MONTHS_OF_YEAR[validPoint.getMonth()],
				    validDay   = validPoint.getDate(),
				    validYear  = validPoint.getFullYear();
				// update `value` with formatted local date
				value = validMonth + ' ' + validDay + ', ' + validYear;
			}
			var entry = key + ": " + value + "\n";
			// add/update text content of `rawCode`
			rawCode.textContent = rawCode.textContent + entry;
		}
		return section;
	};

	/**
	 * Stats getter/setter methods
	 */

	// set network event object
	Stats.setNetworkEvent = function (networkEvent) {
		this.networkEvent = networkEvent;
		return this;
	};

	// get network event object
	Stats.getNetworkEvent = function () {
		return this.networkEvent;
	};

	// get network event response object
	Stats.getResponse = function () {
		return this.getNetworkEvent().response;
	};

	// get request and response headers
	Stats.getHeaders = function () {
		var networkResponse = this.getResponse(),
		    requestHeaders  = networkResponse.hasOwnProperty('requestHeaders')
		                    ? networkResponse.requestHeaders
		                    : {},
		    responseHeaders = networkResponse.headers,
		    combinedHeaders = {
		    	request:  requestHeaders,
		    	response: responseHeaders
		    };
		return combinedHeaders;
	};

	// get security details
	Stats.getSecurityDetails = function () {
		return this.getResponse().securityDetails;
	};

	// get security state (e.g. 'not secure', 'neutral', 'secure')
	Stats.getSecurityState = function () {
		return this.getResponse().securityState;
	};

	// determine if the security state is secure or not
	Stats.isStateSecure = function () {
		return !!(this.getSecurityState() === 'secure');
	};

	// get remote IP address
	Stats.getRemoteIPAddress = function () {
		return this.getResponse().remoteIPAddress;
	};

	// get remote port (e.g. HTTP -> 80, HTTPS -> 443)
	Stats.getRemotePort = function () {
		return this.getResponse().remotePort;
	};

	// get transfer protocol type (e.g. http/1.1, h2)
	Stats.getTransferProtocol = function () {
		return this.getResponse().protocol;
	};

	// get exchange protocol (e.g. TLS 1.1, TLS 1.2)
	Stats.getExchangeProtocol = function () {
		return this.getSecurityDetails().protocol;
	};

	Stats.getKeyExchange = function () {
		return this.getSecurityDetails().keyExchange;
	};

	Stats.getKeyExchangeGroup = function () {
		return this.getSecurityDetails().keyExchangeGroup;
	};

	// get cipher type (e.g. AES_128_GCM)
	Stats.getCipher = function () {
		return this.getSecurityDetails().cipher;
	};

	// get certificate issuer (e.g. Comodo, DigiCert)
	Stats.getCertificateIssuer = function () {
		return this.getSecurityDetails().issuer;
	};

	// get certificate subject name
	Stats.getCertificateSubjectName = function () {
		return this.getSecurityDetails().subjectName;
	};

	window.addEventListener('load', Stats.onLoad, false);
}).call(this);
