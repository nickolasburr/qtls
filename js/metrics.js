(function () {
	'use strict';

	var CERTIFICATE_DETAILS_WHITELIST = [
		'issuer',
		'sanList',
		'subjectName',
		'validFrom',
		'validTo'
	],
	CONNECTION_DETAILS_WHITELIST = [
		'mimeType',
		'protocol',
		'remoteIPAddress',
		'remotePort',
		'status',
		'statusText',
		'url'
	],
	ENCRYPTION_DETAILS_WHITELIST = [
		'cipher',
		'keyExchange',
		'keyExchangeGroup',
		'protocol'
	];

	// external references for certain Encryption value types
	var ENCRYPTION_EXTERN_REFS = {
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
		},
		'protocol': {
			'QUIC': 'https://www.chromium.org/quic'
		}
	};

	// Abbreviated months of the year
	var ABBR_MONTHS_OF_YEAR = [
		'Jan',
		'Feb',
		'Mar',
		'Apr',
		'May',
		'Jun',
		'Jul',
		'Aug',
		'Sept',
		'Oct',
		'Nov',
		'Dec'
	];

	// Common HTTP status codes and their definitions
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

	// Messages to display in UI
	var UI_DISPLAY_MESSAGES = {
		error:   'There was an error trying to debug this page. It is likely due to DevTools blocking the port.',
		invalid: 'Metrics are only available to pages served over a secure HTTPS connection.'
	};

	var Utils = {};

	// Get primitive type of `value`
	Utils.getType = function (value) {
		return (typeof value);
	};

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

	/**
	 * Determine if `obj` is of type 'object'
	 *
	 * @note this is a very loose check on the type 'object',
	 * meaning this could be an object literal, object instance
	 * array literal, array instance, etc.
	 */
	Utils.isObject = function (obj) {
		return this.toBool(obj instanceof Object);
	};

	/**
	 * Determine if `obj` is an object constructed from the native
	 * 'Object' prototype and not a different type of object prototype
	 */
	Utils.isNativeObject = function (obj) {
		return this.toBool(obj instanceof Object && obj.__proto__.constructor.name === 'Object');
	};

	// Determine if object is empty or not
	Utils.isObjectEmpty = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.isObjectEmpty` -> Argument must be an object, not a ' + typeof obj);
		}

		return !Object.keys(obj).length;
	};

	// Determine if `arr` implements Array interface
	Utils.isArray = function (arr) {
		return this.toBool(arr instanceof Array);
	};

	// Determine if `needle` is in `haystack`
	Utils.inArray = function (needle, haystack) {
		if (!this.isArray(haystack)) {
			throw new TypeError('`Utils.inArray` -> `haystack` must be an array, not a ' + typeof haystack);
		}

		return this.toBool(haystack.indexOf(needle) > -1);
	};

	// Determine if `element` is a valid HTMLElement object
	Utils.isElement = function (element) {
		return this.toBool(element instanceof HTMLElement);
	};

	// Determine if `func` is a Function
	Utils.isFunc = function (func) {
		return this.toBool(typeof func === 'function' && func instanceof Function);
	};

	// Get keys from object
	Utils.getKeys = function (obj) {
		if (!this.isObject(obj)) {
			throw new TypeError('`Utils.getKeys` -> Argument must be an object, not a ' + typeof obj);
		}

		return Object.keys(obj);
	};

	// Filter object properties via whitelist of keys
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

		var keys = this.getKeys(obj),
		    len  = keys.length;

		// Remove unwanted properties from `obj`
		for (var i = 0; i < len; i += 1) {
			var key = keys[i];

			if (this.inArray(key, whitelist)) {
				fObj[key] = obj[key];
			}
		}

		return fObj;
	};

	// Check if `key` exists and, if so, does `subkey` have an external reference?
	Utils.hasExternalReference = function (key, subkey) {
		var keys    = this.getKeys(ENCRYPTION_EXTERN_REFS),
		    subkeys = this.inArray(key, keys)
		            ? this.getKeys(ENCRYPTION_EXTERN_REFS[key])
		            : [];

		return this.toBool(this.inArray(subkey, subkeys));
	};

	// Get external reference with `key` and `subkey`
	Utils.getExternalReference = function (key, subkey) {
		if (ENCRYPTION_EXTERN_REFS.hasOwnProperty(key) && ENCRYPTION_EXTERN_REFS[key].hasOwnProperty(subkey)) {
			return ENCRYPTION_EXTERN_REFS[key][subkey];
		}

		return null;
	};

	// Determine if `element` belongs to class `className`
	Utils.hasClass = function (element, className) {
		return this.toBool(element.hasAttribute('class') && (element.getAttribute('class').split(className).length - 1));
	};

	// Add class `className` to `element`
	Utils.addClass = function (element, className) {
		if (!this.hasClass(element, className)) {
			var classAttr = element.getAttribute('class').split(' ');
			classAttr.push(className);
			element.setAttribute('class', classAttr.join(' '));
		}

		return this;
	};

	// Remove class `className` from `element`
	Utils.removeClass = function (element, className) {
		if (this.hasClass(element, className)) {
			var classAttr = element.getAttribute('class').split(className);
			element.setAttribute('class', classAttr.join(' ').trim());
		}

		return this;
	};

	/**
	 *
	 * Metrics & stats methods
	 *
	 */

	var Metrics = Object.create(Utils);

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

		// If the message was sent due to an error (e.g. DevTools is open), display the proper notice
		if (message.reason === 'error') {
			return this.willHideLoader().willDisplayNotice(message.reason);
		}

		// Otherwise, set network event object, hide loader and set stats data in popup
		this.setNetworkEvent(message.event)
		    .willHideLoader()
		    .willDisplayMetrics();
	};

	// `click` event handler
	Metrics.onToggle = function (clickEvent) {
		var target = clickEvent.target,
		    list   = target.parentNode.querySelector('.list');

		if (!list) {
			return;
		}

		// Update arrow direction
		if (!this.hasClass(target, 'arrow-down')) {
			this.removeClass(target, 'arrow-right')
			    .addClass(target, 'arrow-down');
		} else {
			this.removeClass(target, 'arrow-down')
			    .addClass(target, 'arrow-right');
		}

		// Expand/collapse list
		if (!this.hasClass(list, 'expanded')) {
			this.addClass(list, 'expanded');
		} else {
			this.removeClass(list, 'expanded');
		}

		return this;
	};

	/**
	 * Ad-hoc action methods, written for side effects and not suitable for template reuse.
	 *
	 * Conventions include: Methods that start with `will` are pseudo-setters, they make
	 * modifications to the DOM and return the main object (e.g. `Metrics`). Methods that
	 * start with `make` are pseudo-getters, they create something useful for pseudo-setters,
	 * and return that useful something to the caller (e.g. a DOM node with formatted data)
	 */

	// Display notice that metrics and stats aren't available
	Metrics.willDisplayNotice = function (type) {
		type = type || 'invalid';

		var wrapper = document.querySelector('.main'),
		    title   = document.createElement('div'),
		    message = document.createElement('div');

		// Add notice title to `title` element
		this.willSetAttributes(title, {
		      'class': 'notice-title'
		    })
		    .willSetAttributes(message, {
		      'class': 'notice-message'
		    })
		    .willSetTextContent(title, "We're sorry...")
		    .willSetTextContent(message, UI_DISPLAY_MESSAGES[type])
		    // Append `title`, `message` to `wrapper`
		    .willAppendNodes(wrapper, [
		      title, message
		    ]);

		return this;
	};

	// Hide loading icon upon receiving data
	Metrics.willHideLoader = function (selector) {
		selector = selector || '[name="loading"]';

		var loader = document.querySelector(selector);

		if (loader) {
			loader.setAttribute('style', 'display: none !important');
		}

		return this;
	};

	// Append nodes in `children` array to node `parent`
	Metrics.willAppendNodes = function (parent, children) {
		if (this.isElement(children)) {
			parent.appendChild(children);
			return this;
		}

		if (!this.isArray(children)) {
			throw new TypeError('`Metrics.willAppendNodes` -> `children` must either be an HTMLElement or an Array!');
		}

		var len = children.length;

		for (var i = 0; i < len; i += 1) {
			var child = children[i];
			parent.appendChild(child);
		}

		return this;
	};

	// Attach event listener(s) to `element`
	Metrics.willAttachListeners = function (element, listeners) {
		if (!this.isElement(element)) {
			throw new TypeError('`Metrics.willAttachListeners` -> `element` must be an HTMLElement!');
		}

		if (!this.isNativeObject(listeners)) {
			throw new TypeError('`Metrics.willAttachListeners` -> `listeners` must be a native Object!');
		}

		var keys = this.getKeys(listeners),
		    len  = keys.length;

		for (var i = 0; i < len; i += 1) {
			var type = keys[i],
			    func = listeners[type];

			if (!this.isFunc(func)) {
				throw new TypeError('`Metrics.willAttachListeners` -> `func` must be a Function, not a(n) ' + this.getType(func));
			}

			element.addEventListener(type, func, false);
		}

		return this;
	};

	// Set attribute(s) on `element`
	Metrics.willSetAttributes = function (element, attributes) {
		if (!this.isElement(element)) {
			throw new TypeError('`Metrics.willSetAttributes` -> `element` must be an HTMLElement!');
		}

		if (!this.isNativeObject(attributes)) {
			throw new TypeError('`Metrics.willSetAttributes` -> `attributes` must be a native Object!');
		}

		var keys = this.getKeys(attributes),
		    len  = keys.length;

		for (var i = 0; i < len; i += 1) {
			var key   = keys[i],
			    value = attributes[key];

			// Set attribute `key` -> `value` on `element`
			element.setAttribute(key, value);
		}

		return this;
	};

	// Set text content on `element`
	Metrics.willSetTextContent = function (element, text) {
		if (!this.isElement(element)) {
			throw new TypeError('`Metrics.willSetTextContent` -> `element` must be an HTMLElement!');
		}

		element.textContent = this.toString(text);

		return this;
	};

	// Display stats and metrics in metrics.html popup
	Metrics.willDisplayMetrics = function () {
		// If the state is not secure, display a notice to the user in metrics.html popup
		if (!this.isStateSecure()) {
			this.willDisplayNotice();
			return this;
		}

		// If our `<div class="container">` exists (stats have already been displayed), just return
		if (document.querySelector('.container')) {
			return this;
		}

		// Otherwise, get the certificate and exchange details and display in metrics.html popup
		var wrapper     = document.querySelector('.main'),
		    container   = document.createElement('div'),
		    response    = this.getResponse(),
		    security    = this.getSecurityDetails(),
		    certificate = this.toFilterObject(security, CERTIFICATE_DETAILS_WHITELIST),
		    connection  = this.toFilterObject(response, CONNECTION_DETAILS_WHITELIST),
		    encryption  = this.toFilterObject(security, ENCRYPTION_DETAILS_WHITELIST);

		console.log(response);

		// Set `class` attribute on `container`
		this.willSetAttributes(container, {
		      'class': 'container'
		    })
		    .willAppendNodes(wrapper, container)
		    .willAppendNodes(container, [
		      this.makeSection(certificate, 'Certificate'),
		      this.makeSection(encryption,  'Encryption'),
		      this.makeSection(connection,  'Transfer')
		    ]);

		return this;
	};

	// Create `<ul>` block element with given data
	Metrics.makeList = function (data, listClass) {
		listClass = listClass || 'list';

		if (!this.isArray(data)) {
			throw new TypeError('`Metrics.makeList` -> `data` must be an array!');
		}

		var list = document.createElement('ul'),
		    len  = data.length;

		// Set `class` on `list`
		list.setAttribute('class', listClass);

		for (var i = 0; i < len; i += 1) {
			var entry = data[i],
			    item  = document.createElement('li');

			// Set text content on `item`
			item.textContent = entry;
			list.appendChild(item);
		}

		return list;
	};

	// Create formatted date from timestamp
	Metrics.makeDate = function (timestamp) {
		var date  = new Date(timestamp * 1000),
		    month = ABBR_MONTHS_OF_YEAR[date.getMonth()],
		    day   = date.getDate(),
		    year  = date.getFullYear();

		// Return formatted local date
		return (month + ' ' + day + ', ' + year);
	};

	// Create formatted line entry to display in popup
	Metrics.makeEntry = function (key, value, sep) {
		sep = sep || ': ';

		return (key + sep + value);
	};

	// Create `<section>` block element with given data
	Metrics.makeSection = function (data, title) {
		// If `data` isn't an object, throw a TypeError
		if (!this.isObject(data)) {
			throw new TypeError('`Metrics.makeSection` -> `data` must be an object!');
		}

		// Set up our DOM subtree structure
		var section = document.createElement('section'),
		    heading = document.createElement('h3'),
		    wrapper = document.createElement('div'),
		    keys    = Object.keys(data),
		    len     = keys.length;

		// Set heading title text on `heading` element
		this.willSetTextContent(heading, title)
		    // Set `class` attribute on `wrapper`, append both
		    // `heading` and `wrapper` elements to `section`
		    .willSetAttributes(wrapper, {
		      'class': 'section'
		    })
		    .willAppendNodes(section, [
		      heading,
		      wrapper
		    ]);

		// Create the DOM subtree, fill in our data
		for (var i = 0; i < len; i += 1) {
			var key     = keys[i],
			    value   = data[key],
			    element = document.createElement('span');

			// If the response status text is unspecified, set the
			// value to 'Unspecified' instead of leaving it empty
			if (!value && key === 'statusText') {
				value = HTTP_STATUS_CODES[this.toString(data['status'])]
				      ? HTTP_STATUS_CODES[this.toString(data['status'])]
				      : 'Unspecified';
			}

			// If the key exchange algorithm (e.g. ECDHE_RSA, other elliptic curve algorithms)
			// is unspecified, set the value to 'Unspecified' instead of leaving it empty
			if (!value && key === 'keyExchange') {
				value = 'Unspecified';
			}

			// Convert timestamps to local time
			if (key === 'validFrom' || key === 'validTo') {
				// Update `value` with formatted local date
				value = this.makeDate(value);
			}

			// If `value` is an array, make a list `<ul>` and append it to `element`
			if (this.isArray(value)) {
				var toggle = document.createElement('span');

				// Change `element` to `<div>` instead of `<span>`
				element = document.createElement('div');

				// Set text content on `element`, attach `click` event listener to `toggle`,
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
				      toggle, this.makeList(value)
				    ]);

			// Otherwise, just update `element` with text content and tooltip
			} else if (this.hasExternalReference(key, value)) {
				// External reference link `<a>` element
				var link = document.createElement('a'),
				    img  = document.createElement('img');

				// Set `href` and `target` attributes on `link`
				this.willSetAttributes(link, {
				      'href':   this.getExternalReference(key, value),
				      'target': ('_' + value)
				    })
				    .willSetAttributes(img, {
				      'class':  'ref',
				      'height': '16',
				      'width':  '16',
				      'src':    'icons/external-link-16x16.png'
				    })
				    // Set text content on `element`
				    .willSetTextContent(element, this.makeEntry(key, value))
				    // Set `value` tooltip via `title` attribute
				    // on `element`, append `link` to `element`
				    .willSetAttributes(element, {
				      'title': value
				    })
				    .willAppendNodes(link, img)
				    .willAppendNodes(element, link);
			} else {
				// Set text content of `element` element
				this.willSetTextContent(element, this.makeEntry(key, value))
				    // Set `value` tooltip via `title` attribute on `element`
				    .willSetAttributes(element, {
				      'title': value
				    });
			}

			// Append `element` to `wrapper`
			this.willAppendNodes(wrapper, element);
		}

		return section;
	};

	/**
	 * Metrics getter/setter methods
	 */

	// Set network event object
	Metrics.setNetworkEvent = function (networkEvent) {
		this.networkEvent = networkEvent;
		return this;
	};

	// Get network event object
	Metrics.getNetworkEvent = function () {
		return this.networkEvent;
	};

	// Get network event response object
	Metrics.getResponse = function () {
		return this.getNetworkEvent().response;
	};

	// Get request and response headers
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

	// Get security details
	Metrics.getSecurityDetails = function () {
		return this.getResponse().securityDetails;
	};

	// Get security state (e.g. 'not secure', 'neutral', 'secure')
	Metrics.getSecurityState = function () {
		return this.getResponse().securityState;
	};

	// Determine if the security state is secure or not
	Metrics.isStateSecure = function () {
		return this.toBool(this.getSecurityState() === 'secure');
	};

	// Get remote IP address
	Metrics.getRemoteIPAddress = function () {
		return this.getResponse().remoteIPAddress;
	};

	// Get remote port (e.g. HTTP -> 80, HTTPS -> 443)
	Metrics.getRemotePort = function () {
		return this.getResponse().remotePort;
	};

	// Get transfer protocol type (e.g. http/1.1, h2)
	Metrics.getTransferProtocol = function () {
		return this.getResponse().protocol;
	};

	// Get exchange protocol (e.g. TLS 1.1, TLS 1.2)
	Metrics.getExchangeProtocol = function () {
		return this.getSecurityDetails().protocol;
	};

	// Get key exchange algorithm
	Metrics.getKeyExchange = function () {
		return this.getSecurityDetails().keyExchange;
	};

	// Get key exchange group (e.g. DH) algorithm
	Metrics.getKeyExchangeGroup = function () {
		return this.getSecurityDetails().keyExchangeGroup;
	};

	// Get cipher type (e.g. AES_128_GCM)
	Metrics.getCipher = function () {
		return this.getSecurityDetails().cipher;
	};

	// Get certificate issuer (e.g. Comodo, DigiCert)
	Metrics.getCertificateIssuer = function () {
		return this.getSecurityDetails().issuer;
	};

	// Get certificate subject name
	Metrics.getCertificateSubjectName = function () {
		return this.getSecurityDetails().subjectName;
	};

	window.addEventListener('load', Metrics.onLoad, false);
}).call(this);
