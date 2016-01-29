/*
 * The primary objects of concern are:
 * TheGif       - Handles the embedded animation (gif, gifv, webm, etc.)
 * TheSound     - Handles the embedded audio (YouTube, SoundCloud, Vocaroo, mp3 file, etc.)
 * TheForm      - Handles the forms elements and its submission
 * ThePage      - Handles reading and writing GifSound parameters to the URL
 * GifSound     - Handles the whole page and calling relevant objects from above
 * If you think any of this sucks then please fork it.
 * I continue to suck at JavaScript I just can't stop writing it.
 */
var TheGif, TheSound, TheForm, ThePage, GifSound, UserNotifications;

$(function(){

TheForm = {
	s: {
		form           : $('form#gifsound-input'),
		gifInput       : $('input#gif-url'),
		soundInput     : $('input#sound-url'),
		startTimeInput : $('input#sound-start-time'),
		makeButton     : $('a#make-gifsound'),
		urlSanitizer   : /[^-A-Za-z0-9\+&@#\/%?=~_|!:,.;\(\)]/g, // Via stackoverflow.com/a/205967/3565450
		httpDetector   : /^(?:http|https):\/\//i // Checks if URL starts with http:// or https://
	},
	
	init: function() {
		this.bindUIHandlers();
	},
	
	bindUIHandlers : function() {
		this.s.form.submit(TheForm.formSubmission);
	},
	
	formSubmission : function(event) {
		event.preventDefault();
		
		UserNotifications.clearNotifications();
		
		var gifID, soundID, gifPlugin, soundPlugin,
		gifURL           = TheForm.processURL(TheForm.s.gifInput.val()),
		soundURL         = TheForm.processURL(TheForm.s.soundInput.val()),
		startTime        = parseInt(TheForm.s.startTimeInput.val()),
		foundGifPlugin   = false,
		foundSoundPlugin = false;
		
		if (isNaN(startTime)) {
			startTime = 0;
		}
		
		$.each(GifSound.s.gifPlugins, function(pluginName, plugin) {
			gifID = plugin.recogniseURL(gifURL);
			
			if (gifID) {
				gifPlugin = pluginName;
				return false;
			}
		});
		
		if (typeof gifPlugin === 'undefined') {
			GifSound.gifFailed('No plugin could handle the given URL. Try using Imgur');
			return;
		}
		
		$.each(GifSound.s.soundPlugins, function(pluginName, plugin) {
			soundID = plugin.recogniseURL(soundURL);
			
			if (soundID) {
				soundPlugin = pluginName;
				return false;
			}
		});
		
		if (typeof soundPlugin === 'undefined') {
			GifSound.soundFailed('No plugin could handle the given URL. Try using YouTube');
			return;
		}
		
		GifSound.createGifSound(gifID, soundID, gifPlugin, soundPlugin, startTime);
	},
	
	// Sanitizes and fixes URL
	processURL : function(url) {
		url = url.replace(TheForm.s.urlSanitizer, '');
		
		if (!url.match(TheForm.s.httpDetector)) {
			url = 'http://' + url;
		}
		
		return url;
	},
};

/*
 * GIF PLUGINS
 * All gif plugins must have the following methods:
 * recogniseURL    - Given a URL returns true or false if it can handle that URL
 * embedGifByURL   - Given a URL it can process, embeds appropriate gif player (Webm player, <img> tag, etc.) with media paused
 * embedGifByParam - Given a string (of unknown usability), embeds appropriate gif player (Webm player, <img> tag, etc.) with media paused
 * playGif         - Plays embedded gif
 * pauseGif        - Pauses embedded gif
 */

/*
 * General purpose gif plugin
 * Embeds gifs with an img tag (wow, much difficult)
 */
GifPlugin = {
	s : {
		regex   : /^(?:http|https):\/\/((?:[^?#]*\.(?:gif)))$/i, // Via http://stackoverflow.com/a/169631/3565450
		img     : false,
	},
	
	recogniseURL : function(url) {
		var match = url.match(GifPlugin.s.regex);
		
		if (match) {
			return match[1];
		} else {
			return false;
		}
	},
	
	verifyParam : function(url) {
		if (('http://' + url).match(GifPlugin.s.regex)) {
			return true;
		} else {
			return false;
		}
	},
	
	embedGif : function(url, wrapper) {
		url = 'http://' + url;
		
		GifPlugin.s.img = $('<img/>',{src:url});
		
		GifPlugin.s.img.hide();
		
		wrapper.html(GifPlugin.s.img);
		
		GifPlugin.s.img.one('load',  GifSound.gifReady);
		GifPlugin.s.img.one('error', GifPlugin.onError);
		
		/*
		 * Cache fix for browsers that don't trigger 'load'. Thanks Nick Craver:
		 * http://stackoverflow.com/a/2392448/3565450
		 */
		if (GifPlugin.s.img.complete) {
			GifPlugin.s.img.trigger('load');
		}
	},
	
	onError : function () {
		GifSound.gifFailed('Trying visiting <a href="' + GifPlugin.s.img[0].src + '">the gif</a> directly');
	},
	
	playGif : function() {
		GifPlugin.s.img.show();
	},
	
	pauseGif : function() {
		GifPlugin.s.img.hide();
	},
};

/*
 * Embeds Gifvs (webm/mp4s) from imgur.com
 */
GifvPlugin = {
	s : {
		regex   : /^(?:http|https):\/\/i\.imgur\.com\/([a-zA-Z0-9]{5,8})\.gifv/,
		IDRegex : /^[a-zA-Z0-9]{5,8}$/,
		video   : false,
	},
	
	recogniseURL : function(url) {
		var match = url.match(GifvPlugin.s.regex);
		
		if (match) {
			return match[1];
		} else {
			return false;
		}
	},
	
	verifyParam : function(ID) {
		if (ID.match(GifvPlugin.s.IDRegex)) {
			return true;
		} else {
			return false;
		}
	},
	
	// Embeds gifv player of given Imgur image ID to wrapper
	embedGif : function(imgurID, wrapper) {
		var video = document.createElement('video'),
		source1   = document.createElement('source'),
		source2   = document.createElement('source'),
		failure   = document.createElement('p'),
		srcBase   = 'http://i.imgur.com/' + imgurID;
		
		video.loop     = true;
		video.muted    = true;
		
		source1.type = 'video/webm';
		source1.src  = srcBase + '.webm';
		
		source2.type = 'video/mp4';
		source2.src  = srcBase + '.mp4';
		
		failure.innerHTML = 'Gifv failed to load';		
		
		video.appendChild(source1);
		video.appendChild(source2);
		video.appendChild(failure);
		
		video.addEventListener('canplaythrough', GifvPlugin.videoBuffered, false);
		
		// If 2nd source (the last one) fails then 1st source has already failed
		source2.addEventListener('error', GifvPlugin.videoError, false);
		
		GifvPlugin.s.video = video;
		
		wrapper[0].appendChild(video);
	},
	
	videoError(event) {
		event.target.removeEventListener('canplaythrough', GifvPlugin.videoBuffered, false);
		
		GifSound.gifFailed('Maybe it was deleted?');
	},
	
	// When browser thinks video is sufficiently buffered for continuous playback
	videoBuffered() {
		GifvPlugin.s.video.removeEventListener('canplaythrough', GifvPlugin.videoBuffered, false);
		
		GifSound.gifReady();
	},
	
	playGif() {
		GifvPlugin.s.video.play();
	},
	
	pauseGif() {
		GifvPlugin.s.video.pause();
	},
};

/*
 * SOUND PLUGINS
 * All sound plugins must have the following methods:
 * recogniseURL      - Given a URL returns true or false if it can handle that URL
 * embedSoundByURL   - Given a URL, embeds appropriate sound player (YouTube embed, <audio> tag, etc.) with media paused
 * embedSoundByParam - Given a string (of dubious usability), embeds appropriate sound player (YouTube embed, <audio> tag, etc.) with media paused
 * playSound         - Plays embedded sound
 * pauseSound        - Pauses embedded sound
 */

/*
 * Embeds videos from YouTube.com
 * Note: YouTube capitalises id as 'Id' while I use 'ID'
 */
YTPlugin = {
	s : {
		URLRegex  : /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([a-zA-Z0-9_-]{11}).*/, // Improved from http://stackoverflow.com/a/8260383/3565450
		IDRegex   : /^[a-zA-Z0-9_-]{11}$/,
		videoID   : '',    // .e.g dQw4w9WgXcQ
		startTime : 0,
		length    : 0,
		wrapper   : false,
		player    : false,
		apiLoading: false, // Whether the YouTube IFrame Player API has started asynchronously loading
		apiLoaded : false, // Whether the YouTube IFrame Player API has been loaded
	},
	
	// Checks if URL matches a YouTube video
	recogniseURL : function(url) {
		var match = url.match(YTPlugin.s.URLRegex);
		
		if (match) {
			return match[1];
		} else {
			return false;
		}
	},
	
	// Verifies if a string (from a URL) matches the YouTube video ID format
	verifyParam(ID) {
		var match = ID.match(YTPlugin.s.IDRegex);
		
		if (match) {
			return true;
		} else {
			return false;
		}
	},
	
	embedSound : function(videoID, wrapper, startTime) {
		// Resets variable changed if video has been previously embedded
		YTPlugin.s.firstPlay = true;
		
		YTPlugin.s.videoID   = videoID;
		YTPlugin.s.startTime = startTime;
		YTPlugin.s.wrapper   = wrapper;
		
		if (YTPlugin.s.apiLoaded) {
			YTPlugin.loadVideo();
		} else if (!YTPlugin.s.apiLoading) {
			YTPlugin.s.apiLoading = true;
			
			var tag = document.createElement('script');

			tag.src = "https://www.youtube.com/iframe_api";
			var firstScriptTag = document.getElementsByTagName('script')[0];
			firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
			
			window.onYouTubeIframeAPIReady = YTPlugin.onAPIReady;
		}
	},
	
	onAPIReady : function() {
		YTPlugin.s.apiLoaded  = true;
		YTPlugin.s.apiLoading = false;
		
		if (YTPlugin === TheSound) {
			YTPlugin.loadVideo();
		}
	},
	
	// Loads video via YT API. Assumes API has been loaded
	loadVideo : function() {
		if (YTPlugin.s.player !== false) {
			YTPlugin.s.player.loadVideoById(YTPlugin.s.videoID, YTPlugin.s.startTime);
		} else {
			YTPlugin.s.wrapper.html('<div id="youtube-embed"/>');
			
			YTPlugin.s.player = new YT.Player('youtube-embed', {
				height       : '300',
				width        : '300',
				videoId      : YTPlugin.s.videoID,
				playerVars   : {
					'autoplay'       : 1,
					'controls'       : 1,
					'modestbranding' : 1, // Removes some YT branding
					'showinfo'       : 0, // Don't show video info (at top of embed)
					'rel'            : 0, // Don't show related videos
					'fs'             : 0, // Disallow fullscreen
					'loop'           : 1,
					'playlist'       : YTPlugin.s.videoID,
					'start'          : YTPlugin.s.startTime,
				},
				events       : {
					'onReady'       : YTPlugin.onPlayerReady,
					'onStateChange' : YTPlugin.playerStateChange,
					'onError'       : YTPlugin.onError,
				},
			});
		}
	},
	
	playerStateChange : function(event) {
		if (event.data == YT.PlayerState.PLAYING && YTPlugin.s.firstPlay) {
			YTPlugin.s.player.pauseVideo();
			YTPlugin.s.firstPlay = false;
			YTPlugin.s.length    = YTPlugin.s.player.getDuration();
			YTPlugin.readyWhenLoaded();
		}
	},
	
	// Sets sound as ready once the video is sufficiently buffered
	readyWhenLoaded : function() {
		// If more than 5 seconds have loaded or the video is more than 50% buffered
		if (YTPlugin.s.length - YTPlugin.s.player.getCurrentTime() > 5 | YTPlugin.s.player.getVideoLoadedFraction() > 0.5) {
			GifSound.soundReady();
		} else {
			setTimeout(YTPlugin.readyWhenLoaded, 600);
		}
	},
	
	onError : function(event) {
		var explanation;
		
		switch (event.data) {
			// If this error occurs then something fucked up with URL validation or in passing the video ID to this plugin
			case 2:
				explanation = "Invalid YouTube Video ID (it's a bug if you can see this error)"
			break;
			
			case 5:
				explanation = 'HTML5 YouTube player error';
			break;
			
			case 150:
			case 100:
				explanation = 'Video not available. Probably copyright takedown';
			break;
			
			case 101:
				explanation = 'Embedded playing of video not allowed';
			break;
			
			default:
				explanation = 'Something really, REALLY, bad must have happened';
			break;
		}
		
		GifSound.soundFailed(explanation);
	},
	
	playSound : function() {
		YTPlugin.s.player.playVideo();
	},
	
	pauseSound : function() {
		YTPlugin.s.player.pauseVideo();
	},
};

ThePage = {
	s : {
		matchComplexCharacters : /[^a-zA-Z0-9=&\-.]/ // Strips inappropriate characters from URL parameters
	},
	
	init : function() {
		// If there's no parameters there's no GifSound to make
		if (!location.search) {
			return;
		}
		
		var gifPlugin, soundPlugin, gifID, soundID, startTime,
		URLParams        = ThePage.readURLParams(location.search.substring(1)),
		foundGifPlugin   = false,
		foundSoundPlugin = false,
		foundStartTime   = false;
		
		$.each(URLParams, function(paramName, paramValue) {
			if (!foundGifPlugin && GifSound.s.gifPlugins.hasOwnProperty(paramName) && GifSound.s.gifPlugins[paramName].verifyParam(paramValue)) {
				foundGifPlugin = true;
				
				TheGif = GifSound.s.gifPlugins[paramName];
				gifID  = paramValue;
			} else if (!foundSoundPlugin && GifSound.s.soundPlugins.hasOwnProperty(paramName) && GifSound.s.soundPlugins[paramName].verifyParam(paramValue)) {
				foundSoundPlugin = true;
				
				TheSound = GifSound.s.soundPlugins[paramName];
				soundID  = paramValue;
			} else if (!foundStartTime && paramName === 'st') {
				foundStartTime = true;
				
				startTime = parseInt(paramValue);
			}
		});
		
		if (!foundGifPlugin || !foundSoundPlugin) {
			UserNotifications.displayError('Failed to find an appropriate media plugin');
			
			return;
		}
		
		if (typeof startTime === 'undefined' || isNaN(startTime)) {
			startTime = 0;
		}
		
		GifSound.createGifSound(gifID, soundID, gifPlugin, soundPlugin, startTime);
	},
	
	// Turns URL parameters into key/value pairs
	readURLParams : function(paramsString) {
		paramsString = paramsString.replace(ThePage.s.matchComplexCharacters, '');
		
		var paramObject = {},
		paramStrings    = paramsString.split('&');
		
		paramStrings.forEach(function(singleParam) {
			var param = singleParam.split('=', 2);
			
			if (param.length == 2 && param[0] && param[1]) {
				paramObject[param[0]] = param[1];
			}
		});
		
		return paramObject;
	},
};

// Handles the display area and thus the current gif and sound plugins
GifSound = {
	s : {
		gifPlugins         : {
			'gif'  : GifPlugin,
			'gifv' : GifvPlugin,
		},
		soundPlugins       : {
			'yt'   : YTPlugin,
		},
		gifStates          : {
			loading : $('#gif-area > .loading'),
			ready   : $('#gif-area > .ready'),
			display : $('#gif-area > .display'),
			error   : $('#gif-area > .error'),
		},
		soundStates        : {
			loading : $('#sound-area > .loading'),
			ready   : $('#sound-area > .ready'),
			display : $('#sound-area > .display'),
			error   : $('#sound-area > .error'),
		},
		gifState           : 'blank',     // Whether the gif display is showing nothing, loading spinner, ready text, the gif itself or an error
		soundState         : 'blank',
		gifWrapper         : $('#gif-wrapper'),
		soundWrapper       : $('#sound-wrapper'),
		gifReady           : false,
		soundReady         : false,
		currentGifPlugin   : '',
		currentSoundPlugin : '',
	},
	
	createGifSound : function(gifID, soundID, gifPlugin, soundPlugin, startTime) {
		GifSound.setGifState('loading');
		GifSound.setSoundState('loading');
		
		GifSound.s.gifReady   = false;
		GifSound.s.soundReady = false;
		
		// Only resets gif and sound areas if plugin has changed (allows plugin to reuse embed/iframe to save time)
		if (gifPlugin !== GifSound.s.currentGifPlugin) {
			GifSound.s.gifWrapper.html('');
			
			GifSound.s.currentGifPlugin = gifPlugin;
			TheGif                      = GifSound.s.gifPlugins[gifPlugin];
		}

		if (soundPlugin !== GifSound.s.currentSoundPlugin) {
			GifSound.s.soundWrapper.html('');
			
			GifSound.s.currentSoundPlugin = soundPlugin;
			TheSound                      = GifSound.s.soundPlugins[soundPlugin];
		}
		
		TheGif.embedGif(gifID, GifSound.s.gifWrapper);
		TheSound.embedSound(soundID, GifSound.s.soundWrapper, startTime);
	},
	
	setGifState : function(newState) {
		if (newState === GifSound.s.gifState) {
			return;
		}
		
		switch (GifSound.s.gifState) {
			case 'loading':
				GifSound.s.gifStates.loading.removeClass('current-state');
			break;
			
			case 'ready':
				GifSound.s.gifStates.ready.removeClass('current-state');
			break;
			
			case 'display':
				GifSound.s.gifStates.display.removeClass('current-state');
			break;
			
			case 'error':
				GifSound.s.gifStates.error.removeClass('current-state');
			break;
		}
		
		switch (newState) {
			case 'blank':
				// Don't need to do anything
			break;
			
			case 'loading':
				GifSound.s.gifStates.loading.addClass('current-state');
			break;
			
			case 'ready':
				GifSound.s.gifStates.ready.addClass('current-state');
			break;
			
			case 'display':
				GifSound.s.gifStates.display.addClass('current-state');
			break;
			
			case 'error':
				GifSound.s.gifStates.error.addClass('current-state');
			break;
			
			default:
				throw 'Invalid gif state';
			break;
		}
		
		GifSound.s.gifState = newState;
	},
	
	setSoundState : function(newState) {
		if (newState === GifSound.s.soundState) {
			return;
		}
		
		// Cleans up last state
		switch (GifSound.s.soundState) {
			case 'loading':
				GifSound.s.soundStates.loading.removeClass('current-state');
			break;
			
			case 'ready':
				GifSound.s.soundStates.ready.removeClass('current-state');
			break;
			
			case 'display':
				GifSound.s.soundStates.display.removeClass('current-state');
			break;
			
			case 'error':
				GifSound.s.soundStates.error.removeClass('current-state');
			break;
		}
		
		// Sets new state
		switch (newState) {
			case 'blank':
				// Don't need to do anything
			break;
			
			case 'loading':
				GifSound.s.soundStates.loading.addClass('current-state');
			break;
			
			case 'ready':
				GifSound.s.soundStates.ready.addClass('current-state');
			break;
			
			case 'display':
				GifSound.s.soundStates.display.addClass('current-state');
			break;
			
			case 'error':
				GifSound.s.soundStates.error.addClass('current-state');
			break;
			
			default:
				throw 'Invalid gif state';
			break;
		}
		
		GifSound.s.soundState = newState;
	},
	
	gifReady : function() {
		console.log('Gif Ready');
		
		GifSound.s.gifReady = true;
		GifSound.setGifState('ready');
		
		GifSound.playIfSynced();
	},
	
	soundReady : function() {
		console.log('Sound Ready');
		
		GifSound.s.soundReady = true;
		GifSound.setSoundState('ready');
		
		GifSound.playIfSynced();
	},
	
	playIfSynced : function() {
		if (GifSound.s.gifReady && GifSound.s.soundReady) {
			console.log('Gif and Sound are synced');
			
			GifSound.setGifState('display');
			GifSound.setSoundState('display');
			
			TheGif.playGif();
			TheSound.playSound();
		}
	},
	
	gifFailed : function(optionalMessage) {
		GifSound.setGifState('error');
		UserNotifications.displayError('Gif failed to load: ' + optionalMessage);
	},
	
	soundFailed : function(optionalMessage) {
		GifSound.setSoundState('error');
		UserNotifications.displayError('Sound failed to load: ' + optionalMessage);
	},
};

UserNotifications = {
	s : {
		notificationArea : $('div#notifications'),
		displaying       : false,
	},
	
	clearNotifications() {
		if (UserNotifications.s.displaying) {
			UserNotifications.s.notificationArea.html('');
			UserNotifications.s.displaying = false;
		}
	},
	
	displayError : function(errorMessage) {
		UserNotifications.appendNotification(errorMessage, 'error');
	},
	
	displayMessage : function(message) {
		UserNotifications.appendNotification(message, 'notification');
	},
	
	appendNotification : function(message, type) {
		var notification = document.createElement('p');
		
		notification.classList.add(type);
		notification.innerHTML = message;
		
		UserNotifications.s.notificationArea[0].appendChild(notification);
		
		UserNotifications.s.displaying = true;
	},
};

ThePage.init();
TheForm.init();

});