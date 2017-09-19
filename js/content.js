(function () {
	'use strict';

	var Network = {};

	/**
	 * `window.onload` event handler
	 */
	Network.onLoad = function () {
		var onMessage = Network.onMessage.bind(Network);
		return chrome.runtime.onMessage.addListener(onMessage);
	};

	Network.onMessage = function (message, sender) {
		var url = message.url,
		    xhr = new XMLHttpRequest();

		// Send a GET request to trigger the Debugger event listener
		xhr.open('GET', url);
		xhr.send();
	};

	if (document.readyState === 'complete') {
		Network.onLoad();
	} else {
		window.addEventListener('load', Network.onLoad, false);
	}
}).call(this);
