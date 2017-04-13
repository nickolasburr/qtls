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
			'ECDHE_ECDSA': 'https://tools.ietf.org/html/rfc4492#section-2.2',
			'ECDHE_RSA':   'https://tools.ietf.org/html/rfc4492#section-2.4'
		},
		'keyExchangeGroup': {
			'P-256':  'http://csrc.nist.gov/groups/ST/toolkit/documents/dss/NISTReCur.pdf',
			'P-384':  'http://csrc.nist.gov/groups/ST/toolkit/documents/dss/NISTReCur.pdf',
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
	    Utils   = {};

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
		return !!(obj instanceof Object);
	};

	/**
	 * determine if `obj` is an object constructed from the native
	 * 'Object' prototype and not a different type of object prototype
	 */
	Utils.isNativeObject = function (obj) {
		return !!(obj instanceof Object && obj.__proto__.constructor.name === 'Object');
	};

	// determine if object is empty or not
	Utils.isObjectEmpty = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.isObjectEmpty` -> Argument must be an object, not a ' + typeof obj);
		}
		return !Object.keys(obj).length;
	};

	// determine if `arr` implements Array interface
	Utils.isArray = function (arr) {
		return !!(arr instanceof Array);
	};

	// determine if `needle` is in `haystack`
	Utils.inArray = function (needle, haystack) {
		if (!this.isArray(haystack)) {
			throw new TypeError('`Utils.inArray` -> `haystack` must be an array, not a ' + typeof haystack);
		}
		return !!(haystack.indexOf(needle) > -1);
	};

	// determine if `element` is a valid HTMLElement object
	Utils.isElement = function (element) {
		return !!(element instanceof HTMLElement);
	};

	// determine if `func` is a Function
	Utils.isFunction = function (func) {
		return !!(typeof func === 'function' && func instanceof Function);
	};

	// filter object properties via whitelist of keys
	Utils.toFilterObject = function (obj, whitelist) {
		whitelist = whitelist || [];
		var fObj = {};
		// `obj` must be a native object, otherwise throw a TypeError
		if (!this.isNativeObject(obj)) {
			throw new TypeError('`Utils.toFilterObject` -> `obj` must be a native Object!');
		}
		// `whitelist` must be an array, otherwise throw a TypeError
		if (!this.isArray(whitelist)) {
			throw new TypeError('`Utils.toFilterObject` -> `whitelist` must be an Array!');
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
		return !!(element.hasAttribute('class') && (element.getAttribute('class').split(className).length - 1));
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
		if (Utils.isElement(children)) {
			parent.appendChild(children);
			return this;
		}
		if (!Utils.isArray(children)) {
			throw new TypeError('`Metrics.willAppendNodes` -> `children` must either be an HTMLElement or an Array!');
		}
		var len = children.length;
		for (var i = 0; i < len; i += 1) {
			var child = children[i];
			parent.appendChild(child);
		}
		return this;
	};

	// attach event listener(s) to `element`
	Metrics.willAttachListeners = function (element, listeners) {
		if (!Utils.isElement(element)) {
			throw new TypeError('`Metrics.willAttachListeners` -> `element` must be an HTMLElement!');
		}
		if (!Utils.isNativeObject(listeners)) {
			throw new TypeError('`Metrics.willAttachListeners` -> `listeners` must be a native Object!');
		}
		var keys = Object.keys(listeners),
		    len  = keys.length;
		for (var i = 0; i < len; i += 1) {
			var type = keys[i],
			    func = listeners[type];
			if (!Utils.isFunction(func)) {
				throw new TypeError('`Metrics.willAttachListeners` -> `func` must be a Function!');
			}
			element.addEventListener(type, func, false);
		}
		return this;
	};

	// set attribute(s) on `element`
	Metrics.willSetAttributes = function (element, attributes) {
		if (!Utils.isElement(element)) {
			throw new TypeError('`Metrics.willSetAttributes` -> `element` must be an HTMLElement!');
		}
		if (!Utils.isNativeObject(attributes)) {
			throw new TypeError('`Metrics.willSetAttributes` -> `attributes` must be a native Object!');
		}
		var keys = Object.keys(attributes),
		    len  = keys.length;
		for (var i = 0; i < len; i += 1) {
			var key   = keys[i],
			    value = attributes[key];
			// set attribute `key` -> `value` on `element`
			element.setAttribute(key, value);
		}
		return this;
	};

	// set text content on `element`
	Metrics.willSetTextContent = function (element, text) {
		if (!Utils.isElement(element)) {
			throw new TypeError('`Metrics.willSetTextContent` -> `element` must be an HTMLElement!');
		}
		element.textContent = text;
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
		var wrapper     = document.querySelector('.main'),
		    container   = document.createElement('div'),
		    response    = this.getResponse(),
		    security    = this.getSecurityDetails(),
		    certificate = Utils.toFilterObject(security, CERTIFICATE_DETAILS_WHITELIST),
		    connection  = Utils.toFilterObject(response, CONNECTION_DETAILS_WHITELIST),
		    encryption  = Utils.toFilterObject(security, ENCRYPTION_DETAILS_WHITELIST);
		// set `class` attribute on `container`
		this.willSetAttributes(container, {
			'class': 'container'
		})
		.willAppendNodes(wrapper, container)
		.willAppendNodes(container, [
			this.makeSection(certificate, 'Certificate'),
			this.makeSection(connection,  'Connection'),
			this.makeSection(encryption,  'Encryption')
		]);
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

	// create formatted date from timestamp
	Metrics.makeDate = function (timestamp) {
		var date  = new Date(timestamp * 1000),
		    month = ABBR_MONTHS_OF_YEAR[date.getMonth()],
		    day   = date.getDate(),
		    year  = date.getFullYear();
		// return formatted local date
		return (month + ' ' + day + ', ' + year);
	};

	// create formatted line entry to display in popup
	Metrics.makeEntry = function (key, value, sep) {
		sep = sep || ': ';
		return (key + sep + value);
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
		// set `class` attribute on `wrapper`, append both
		// `heading` and `wrapper` elements to `section`
		this.willSetAttributes(wrapper, {
			'class': 'section'
		})
		.willAppendNodes(section, [
			heading,
			wrapper
		]);
		for (var i = 0; i < len; i += 1) {
			var key     = keys[i],
			    value   = data[key],
			    element = document.createElement('span');
			// if the response status text is unspecified, set the
			// value to 'Unspecified' instead of leaving it empty
			if (!value && key === 'statusText') {
				value = HTTP_STATUS_CODES[Utils.toString(data['status'])]
				      ? HTTP_STATUS_CODES[Utils.toString(data['status'])]
				      : 'Unspecified';
			}
			// if the key exchange algorithm (e.g. ECDHE_RSA, other elliptic curve algorithms)
			// is unspecified, set the value to 'Unspecified' instead of leaving it empty
			if (!value && key === 'keyExchange') {
				value = 'Unspecified';
			}
			// convert timestamps to local time
			if (key === 'validFrom' || key === 'validTo') {
				// update `value` with formatted local date
				value = this.makeDate(value);
			}
			// if `value` is an array, make a list `<ul>` and append it to `element`
			if (Utils.isArray(value)) {
				var list   = this.makeList(value),
				    toggle = document.createElement('span');
				// change `element` to `<div>`
				element = document.createElement('div');
				// set text content on `element`, attach `click` event listener to `toggle`,
				// set `name` and `class` attributes on `toggle`,
				// append `toggle` and `list` elements to `element`
				this.willSetTextContent(element, this.makeEntry(key, ''))
				    .willAttachListeners(toggle, {
				      'click': this.onToggle
				    })
				    .willSetAttributes(toggle, {
				      'name':  'toggle',
				      'class': 'arrow-right'
				    })
				    .willAppendNodes(element, [
				      toggle, list
				    ]);
			// otherwise, just update `element` with text content and tooltip
			} else if (Utils.hasExternalReference(key, value)) {
				var link = document.createElement('a'),
				    href = Utils.getExternalReference(key, value);
				// set `href` and `target` attributes on `link`
				this.willSetAttributes(link, {
					'href':   href,
					'target': ('_' + value)
				});
				// set text content on `link` and `element`
				element.textContent = this.makeEntry(key, '');
				link.textContent    = value;
				// set `value` tooltip via `title` attribute
				// on `element`, append `link` to `element`
				this.willSetAttributes(element, {
					'title': value
				})
				.willAppendNodes(element, link);
			} else {
				var entry = this.makeEntry(key, value);
				// set text content of `element` element
				element.textContent = entry;
				// set `value` tooltip via `title` attribute on `element`
				this.willSetAttributes(element, {
					'title': value
				});
			}
			// append `element` to `wrapper`
			this.willAppendNodes(wrapper, element);
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
