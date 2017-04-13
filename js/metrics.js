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
	ENCRYPTION_DETAILS_WHITELIST = [
		'cipher', 'keyExchange',
		'keyExchangeGroup', 'protocol'
	];

	// external references for certain value types
	var VALUES_EXTERNAL_REFERENCES = {
		'cipher': {
			'AES_128_GCM': 'https://tools.ietf.org/html/rfc5288#section-3',
			'AES_256_GCM': 'https://tools.ietf.org/html/rfc5288#section-3'
		},
		'keyExchange': {
			'ECDHE_RSA': 'https://tools.ietf.org/html/rfc4492#section-2.4'
		},
		'keyExchangeGroup': {
			'P-256': 'http://csrc.nist.gov/groups/ST/toolkit/documents/dss/NISTReCur.pdf',
			'P-384': 'http://csrc.nist.gov/groups/ST/toolkit/documents/dss/NISTReCur.pdf',
			'X25519': 'https://tools.ietf.org/html/rfc7748#section-5'
		}
	};

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

	// messages to display in UI
	var UI_DISPLAY_MESSAGES = {
		error:   'There was an error trying to debug this page. It is likely due to DevTools blocking the port.',
		invalid: 'Metrics are only available to pages served over a secure HTTPS connection.'
	};

	// segmented namespaces
	var Metrics = {},
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

	// check if `key` exists and, if so, does `subkey` have an external reference?
	Utils.hasExternalReference = function (key, subkey) {
		var keys    = Object.keys(VALUES_EXTERNAL_REFERENCES),
		    subkeys = this.inArray(key, keys)
		            ? Object.keys(VALUES_EXTERNAL_REFERENCES[key])
		            : [];
		return !!(this.inArray(subkey, subkeys));
	};

	// get external reference with `key` and `subkey`
	Utils.getExternalReference = function (key, subkey) {
		if (VALUES_EXTERNAL_REFERENCES.hasOwnProperty(key) && VALUES_EXTERNAL_REFERENCES[key].hasOwnProperty(subkey)) {
			return VALUES_EXTERNAL_REFERENCES[key][subkey];
		}
		return null;
	};

	// determine if `element` belongs to class `className`
	Utils.hasClass = function (element, className) {
		if (element.hasAttribute('class') && (element.getAttribute('class').split(className).length - 1)) {
			return true;
		}
		return false;
	};

	// add class `className` to `element`
	Utils.addClass = function (element, className) {
		if (!this.hasClass(element, className)) {
			var classAttr = element.getAttribute('class').split(' ');
			classAttr.push(className);
			element.setAttribute('class', classAttr.join(' '));
		}
		return this;
	};

	// remove class `className` from `element`
	Utils.removeClass = function (element, className) {
		if (this.hasClass(element, className)) {
			var classAttr = element.getAttribute('class').split(className);
			element.setAttribute('class', classAttr.join(' ').trim());
		}
		return this;
	};

	/**
	 * Metrics & stats methods
	 */

	// `load` event handler
	Metrics.onLoad = function () {
		var onMessage = Metrics.onMessage.bind(Metrics);
		chrome.runtime.onMessage.addListener(onMessage);
		chrome.runtime.sendMessage({ from: 'metrics', reason: 'request' });
	};

	// `chrome.runtime.onMessage` event handler
	Metrics.onMessage = function (message, sender) {
		if (message.from !== 'background') {
			throw new Error('Cannot accept messages from unknown sources!');
		}
		// if the message was sent due to an error (e.g. DevTools is open), display the proper notice
		if (message.reason === 'error') {
			return this.willHideLoader().willDisplayNotice(message.reason);
		}
		// otherwise, set network event object, hide loader and set stats data in popup
		this.setNetworkEvent(message.event)
		    .willHideLoader()
		    .willDisplayMetrics();
	};

	// `click` event handler
	Metrics.onToggle = function (clickEvent) {
		var list = clickEvent.target.parentNode.querySelector('.list');
		if (!list) {
			return;
		}
		// update arrow direction
		if (!Utils.hasClass(clickEvent.target, 'arrow-down')) {
			Utils.removeClass(clickEvent.target, 'arrow-right');
			Utils.addClass(clickEvent.target, 'arrow-down');
		} else {
			Utils.removeClass(clickEvent.target, 'arrow-down');
			Utils.addClass(clickEvent.target, 'arrow-right');
		}
		// expand/collapse list
		if (!Utils.hasClass(list, 'expanded')) {
			Utils.addClass(list, 'expanded');
		} else {
			Utils.removeClass(list, 'expanded');
		}
		return this;
	};

	/**
	 * Ad-hoc action methods, written for their side effects and not suitable for template reuse.
	 *
	 * Conventions are as follows: Methods that start with `will` are pseudo-setters, they make
	 * modifications to the DOM and return the main instance object (e.g. `Metrics`). Methods that
	 * start with `make` are pseudo-getters, they create something useful for pseudo-setters, and
	 * return that useful something to the caller (e.g. a node with data to be inserted in the DOM)
	 */

	// display notice that metrics and stats aren't available
	Metrics.willDisplayNotice = function (type) {
		type = type || 'invalid';
		var mainWrapper = document.querySelector('.main'),
		    title       = document.createElement('div'),
		    message     = document.createElement('div');
		// add notice title to `title` element
		title.textContent = 'We\'re sorry...';
		title.setAttribute('class', 'notice-title');
		// add notice text to `message` element
		message.textContent = UI_DISPLAY_MESSAGES[type];
		message.setAttribute('class', 'notice-message');
		// append `title` and `message` to `mainWrapper`
		this.willAppendNodes(mainWrapper, [title, message]);
		return this;
	};

	// hide loading icon upon receiving data
	Metrics.willHideLoader = function (selector) {
		selector = selector || '[name="loading"]';
		var loader = document.querySelector(selector);
		if (loader) {
			loader.setAttribute('style', 'display: none !important');
		}
		return this;
	};

	// append nodes in `children` array to node `parent`
	Metrics.willAppendNodes = function (parent, children) {
		var len = children.length;
		for (var i = 0; i < len; i += 1) {
			var child = children[i];
			parent.appendChild(child);
		}
		return this;
	};

	// display stats and metrics in metrics.html popup
	Metrics.willDisplayMetrics = function () {
		// if the state is not secure, display a notice to the user in metrics.html popup
		if (!this.isStateSecure()) {
			this.willDisplayNotice();
			return this;
		}
		// if our `<div class="container">` exists (stats have already been displayed), just return
		if (document.querySelector('.container')) {
			return this;
		}
		// otherwise, get the certificate and exchange details and display in metrics.html popup
		var mainWrapper        = document.querySelector('.main'),
		    container          = document.createElement('div'),
		    responseDetails    = this.getResponse(),
		    securityDetails    = this.getSecurityDetails(),
		    certificateDetails = Utils.toFilterObject(securityDetails, CERTIFICATE_DETAILS_WHITELIST),
		    certificateBlock   = this.makeSection(certificateDetails, 'Certificate', true),
		    connectionDetails  = Utils.toFilterObject(responseDetails, CONNECTION_DETAILS_WHITELIST),
		    connectionBlock    = this.makeSection(connectionDetails, 'Connection', true),
		    encryptionDetails  = Utils.toFilterObject(securityDetails, ENCRYPTION_DETAILS_WHITELIST),
		    encryptionBlock    = this.makeSection(encryptionDetails, 'Encryption', true);
		// set `class` attribute on `container`
		container.setAttribute('class', 'container');
		// append `container` to `mainWrapper`
		mainWrapper.appendChild(container);
		// append block section(s) to `container` element
		this.willAppendNodes(container, [certificateBlock, connectionBlock, encryptionBlock]);
		return this;
	};

	// create `<ul>` block element with given data
	Metrics.makeList = function (data, listClass) {
		listClass = listClass || 'list';
		if (!Utils.isArray(data)) {
			throw new TypeError('`Metrics.makeList` -> `data` must be an array!');
		}
		var list = document.createElement('ul'),
		    len  = data.length;
		// set `class` on `list`
		list.setAttribute('class', listClass);
		for (var i = 0; i < len; i += 1) {
			var entry = data[i],
			    item  = document.createElement('li');
			// set text content on `item`
			item.textContent = entry;
			list.appendChild(item);
		}
		return list;
	};

	// create `<section>` block element with given data
	Metrics.makeSection = function (data, title) {
		// if `data` isn't an object, throw a TypeError
		if (!Utils.isObject(data)) {
			throw new TypeError('`Metrics.makeSection` -> `data` must be an object!');
		}
		// set up our DOM subtree structure
		var section = document.createElement('section'),
		    heading = document.createElement('h3'),
		    wrapper = document.createElement('div'),
		    keys    = Object.keys(data),
		    len     = keys.length;
		// set heading title text on `heading` element
		heading.textContent = title;
		// set `class` attribute on `wrapper`
		wrapper.setAttribute('class', 'section');
		// append `heading` element to `section` element
		section.appendChild(heading);
		// append `wrapper` element to `section` element
		section.appendChild(wrapper);
		for (var i = 0; i < len; i += 1) {
			var key     = keys[i],
			    value   = data[key],
			    element = document.createElement('span');
			// if the response status text is unspecified, set the
			// value to 'Unspecified' instead of leaving it empty
			if (!value && key === 'statusText') {
				value = !HTTP_STATUS_CODES[Utils.toString(data['status'])]
				      ? 'Unspecified'
				      : HTTP_STATUS_CODES[Utils.toString(data['status'])];
			}
			// if the key exchange algorithm (e.g. ECDHE_RSA, other elliptic curve algorithms)
			// is unspecified, set the value to 'Unspecified' instead of leaving it empty
			if (!value && key === 'keyExchange') {
				value = 'Unspecified';
			}
			// convert timestamps to local time
			if (key === 'validFrom' || key === 'validTo') {
				var validPoint = new Date(value * 1000),
				    validDay   = validPoint.getDate(),
				    validMonth = ABBR_MONTHS_OF_YEAR[validPoint.getMonth()],
				    validYear  = validPoint.getFullYear();
				// update `value` with formatted local date
				value = validMonth + ' ' + validDay + ', ' + validYear;
			}
			// if `value` is an array, make a list `<ul>` and append it to `element`
			if (Utils.isArray(value)) {
				var list   = this.makeList(value),
				    toggle = document.createElement('span');
				// change `element` to `<div>`
				element = document.createElement('div');
				element.textContent = key + ': ';
				toggle.setAttribute('name', 'toggle');
				toggle.setAttribute('class', 'arrow-right');
				toggle.addEventListener('click', Metrics.onToggle, false);
				element.appendChild(toggle);
				element.appendChild(list);
			// otherwise, just update `element` with text content and tooltip
			} else if (Utils.hasExternalReference(key, value)) {
				var link = document.createElement('a'),
				    href = Utils.getExternalReference(key, value);
				// set `href` and `target` attributes on `link`
				link.setAttribute('href', href);
				link.setAttribute('target', '_' + value);
				// set text content on `link` and `element`
				element.textContent = key + ': ';
				link.textContent    = value;
				// set `value` tooltip via `title` attribute on `element`
				element.setAttribute('title', value);
				// append `link` to `element`
				element.appendChild(link);
			} else {
				var entry = key + ': ' + value;
				// set text content of `element` element
				element.textContent = entry;
				// set `value` tooltip via `title` attribute on `element`
				element.setAttribute('title', value);
			}
			// append `element` to `wrapper`
			wrapper.appendChild(element);
		}
		return section;
	};

	/**
	 * Metrics getter/setter methods
	 */

	// set network event object
	Metrics.setNetworkEvent = function (networkEvent) {
		this.networkEvent = networkEvent;
		return this;
	};

	// get network event object
	Metrics.getNetworkEvent = function () {
		return this.networkEvent;
	};

	// get network event response object
	Metrics.getResponse = function () {
		return this.getNetworkEvent().response;
	};

	// get request and response headers
	Metrics.getHeaders = function () {
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
	Metrics.getSecurityDetails = function () {
		return this.getResponse().securityDetails;
	};

	// get security state (e.g. 'not secure', 'neutral', 'secure')
	Metrics.getSecurityState = function () {
		return this.getResponse().securityState;
	};

	// determine if the security state is secure or not
	Metrics.isStateSecure = function () {
		return !!(this.getSecurityState() === 'secure');
	};

	// get remote IP address
	Metrics.getRemoteIPAddress = function () {
		return this.getResponse().remoteIPAddress;
	};

	// get remote port (e.g. HTTP -> 80, HTTPS -> 443)
	Metrics.getRemotePort = function () {
		return this.getResponse().remotePort;
	};

	// get transfer protocol type (e.g. http/1.1, h2)
	Metrics.getTransferProtocol = function () {
		return this.getResponse().protocol;
	};

	// get exchange protocol (e.g. TLS 1.1, TLS 1.2)
	Metrics.getExchangeProtocol = function () {
		return this.getSecurityDetails().protocol;
	};

	Metrics.getKeyExchange = function () {
		return this.getSecurityDetails().keyExchange;
	};

	Metrics.getKeyExchangeGroup = function () {
		return this.getSecurityDetails().keyExchangeGroup;
	};

	// get cipher type (e.g. AES_128_GCM)
	Metrics.getCipher = function () {
		return this.getSecurityDetails().cipher;
	};

	// get certificate issuer (e.g. Comodo, DigiCert)
	Metrics.getCertificateIssuer = function () {
		return this.getSecurityDetails().issuer;
	};

	// get certificate subject name
	Metrics.getCertificateSubjectName = function () {
		return this.getSecurityDetails().subjectName;
	};

	window.addEventListener('load', Metrics.onLoad, false);
}).call(this);
