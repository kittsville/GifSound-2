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
		
		/*
		 * If the browser supports it, dynamically changes the current URL to the new GifSound
		 * Otherwise reloads the page with the new GifSound as the URL
		 */
		if (ThePage.supportsHistory()) {
			GifSound.createGifSound(gifID, soundID, gifPlugin, soundPlugin, startTime, true);
		} else {
			ThePage.updateURL(gifID, soundID, gifPlugin, soundPlugin, startTime);
		}
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
 * recogniseURL - Given a URL returns the string it could use to embed the gif or false. e.g. 'http://imgur.com/jVPevfc' --> 'jVPevfc'
 * verifyParam  - Given a string, returns true/false if it looks like the ID of a gif it can handle e.g. 'jVPevfc'. Don't verify if the resource exists (no HTTP requests)
 * embedGif     - Given a string (of unknown usability), embeds appropriate gif player (Webm player, <img> tag, etc.) with media paused
 * playGif      - Plays embedded gif
 * pauseGif     - Pauses embedded gif
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
		regex   : /^(?:http|https):\/\/(?:i\.)?imgur\.com\/([a-z0-9]{5,8})(?:\.gifv|\.gif)?$/i,
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
		
		video.loop   = true;
		video.muted  = true;
		
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
		
		wrapper[0].innerHTML = '';
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
 * recogniseURL - Given a URL returns the (sub)string it would need to embed the sound or false if it could not
 * verifyParam  - Given a string, returns true/false if it looks like the ID of a sound it can handle e.g. 'Cx_5j6bvY88'. Don't verify if the resource exists (no HTTP requests)
 * embedSound   - Given a URL, embeds appropriate sound player (YouTube embed, <audio> tag, etc.) with media paused
 * playSound    - Plays embedded sound
 * pauseSound   - Pauses embedded sound
 */

/*
 * Embeds videos from YouTube.com
 * Note: YouTube capitalises id as 'Id' while I use 'ID'
 */
YTPlugin = {
	s : {
		URLRegex  : /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([a-zA-Z0-9_-]{11}).*/, // Improved from http://stackoverflow.com/a/8260383/3565450
		IDRegex   : /^[a-zA-Z0-9_-]{11}$/,
		playerID  : 'youtube-embed',
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
		if (typeof TheSound.s.player === 'object' && document.getElementById(YTPlugin.s.playerID)) {
			YTPlugin.s.player.loadVideoById(YTPlugin.s.videoID, YTPlugin.s.startTime);
		} else {
			YTPlugin.s.wrapper.html('<div id="' + YTPlugin.s.playerID + '"/>');
			
			YTPlugin.s.player = new YT.Player(YTPlugin.s.playerID, {
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

/*
 * Embeds audio from SoundCloud.com
 * I hate this plugin so much
 * Check #20 before asking questions/forking this:
 * https://github.com/kittsville/GifSound-2/issues/20
 */
SCPlugin = {
	s : {
		URLRegex   : /^(?:https|http):\/\/(?:(soundcloud\.com\/[a-z0-9\-_]{3,255}\/[a-z0-9\-_]{3,255})|(snd\.sc\/[a-z0-9]{6,7}))$/i,
		IDRegex    : /^[0-9]{8,10}$/,
		clientID   : 'dd2c702d213d9564881d266576fe80d0',
		trackID    : '',
		gotTrackID : false,
		startTime  : 0,
		apiLoaded  : false,
		player     : false,
		iFrame     : false,
		wrapper    : false,
		playerID   : 'sc-embed',
		firstPlay  : true,
	},
	
	recogniseURL : function(url) {
		var match = url.match(SCPlugin.s.URLRegex);
		
		if (match) {
			return match[1];
		} else {
			return false;
		}
	},
	
	verifyParam : function(ID) {
		var match = ID.match(SCPlugin.s.IDRegex);
		
		if (match) {
			return true;
		} else {
			return false;
		}
	},
	
	embedSound : function(soundID, wrapper, startTime) {
		SCPlugin.s.startTime  = startTime;
		SCPlugin.s.wrapper    = wrapper;
		SCPlugin.s.trackID    = soundID;
		SCPlugin.s.gotTrackID = SCPlugin.verifyParam(soundID);
		SCPlugin.s.firstPlay  = true;
		
		if (SCPlugin.s.apiLoaded && SCPlugin.s.gotTrackID) {
			SCPlugin.loadSound();
		}
		
		if (!SCPlugin.s.apiLoaded) {
			jQuery.ajax({
				dataType : "script",
				cache    : true,
				url      : 'https://w.soundcloud.com/player/api.js',
				complete : SCPlugin.loadedAPI
			});
		}
		
		// Checks if plugin has been passed track ID '241851698' or track URL 'iamsorryforwhatihavedone/dogg-simulator'
		if (!SCPlugin.verifyParam(soundID)) {
			var params = $.param({
				client_id : SCPlugin.s.clientID,
				url       : 'http://' + soundID,
			}, true);
			
			$.ajax({
				url      : 'http://api.soundcloud.com/resolve.json?' + params,
				cache    : true,
				dataType : 'json',
				complete : SCPlugin.recievedTrackID,
			});
		}
	},
	
	// Handles SoundCloud API response to resolving a track's URL to its numeric ID
	recievedTrackID : function(response) {
		if (response.status === 200) {
			SCPlugin.s.gotTrackID = true;
			SCPlugin.s.trackID    = response.responseJSON.id;
			
			// Checks if the GifSound's changed while the script's been loading
			if (TheSound === SCPlugin && SCPlugin.s.apiLoaded) {
				GifSound.updateSoundID(SCPlugin.s.trackID);
				
				SCPlugin.loadSound();
			}
		} else {
			GifSound.gifFailed('SoundCloud API Error ' + response.status + ' (' + response.statusText + ')');
		}
	},
	
	loadedAPI : function(xhr, status) {
		if (status === 'success') {
			SCPlugin.s.apiLoaded = true;
			
			// Checks if the GifSound's changed while the script's been loading
			if (TheSound === SCPlugin && SCPlugin.s.gotTrackID) {
				SCPlugin.loadSound();
			}
		} else {
			GifSound.soundFailed("Couldn't load SoundCloud API"); 
		}
	},
	
	loadSound : function() {
		// If player already exists (last GifSound played used SoundCloud)
		if (typeof SCPlugin.s.player === 'object' && document.getElementById(SCPlugin.s.playerID)) {
			console.log('repurposing existing embed');
			SCPlugin.s.player.load('https://api.soundcloud.com/tracks/' + SCPlugin.s.trackID);
		} else {
			var iFrame         = document.createElement('iframe');
			
			iFrame.id          = SCPlugin.s.playerID;
			iFrame.src         = 'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/' + SCPlugin.s.trackID;
			iFrame.width       = '100%';
			iFrame.height      = '300px';
			iFrame.scrolling   = 'no';
			iFrame.frameBorder = '0';
			
			SCPlugin.s.wrapper[0].innerHTML = '';
			SCPlugin.s.wrapper[0].appendChild(iFrame);
			
			SCPlugin.s.player = SC.Widget(SCPlugin.s.playerID);
			
			SCPlugin.s.player.bind(SC.Widget.Events.READY, SCPlugin.embedReady);
			SCPlugin.s.player.bind(SC.Widget.Events.ERROR, SCPlugin.onPlayerError);
		}
	},
	
	onPlayerError : function() {
		GifSound.soundFailed('SoundCloud embed failed');
		
		SCPlugin.s.wrapper[0].innerHTML = '';
	},
	
	embedReady : function() {
		if (SCPlugin.s.startTime === 0) {
			GifSound.soundReady();
		} else {
			SCPlugin.s.player.bind(SC.Widget.Events.PLAY_PROGRESS, function(){
				SCPlugin.s.player.unbind(SC.Widget.Events.PLAY_PROGRESS);
				SCPlugin.s.player.bind(SC.Widget.Events.PLAY_PROGRESS, SCPlugin.embedReadyAtStartTime);
				
				SCPlugin.s.player.seekTo(SCPlugin.s.startTime * 1000);
			});
			
			SCPlugin.s.player.play();
		}
	},
	
	embedReadyAtStartTime(data) {
		SCPlugin.s.player.unbind(SC.Widget.Events.PLAY_PROGRESS);
		SCPlugin.s.player.pause();
		setTimeout(GifSound.soundReady, 500);
	},
	
	playSound : function() {
		SCPlugin.s.player.play();
	},
	
	pauseSound : function() {
		SCPlugin.s.player.pause();
	},
};

ThePage = {
	s : {
		matchComplexCharacters : /[^a-zA-Z0-9=&\-.\/%]/, // Strips inappropriate characters from URL parameters
		supportsHistory        : window.history && history.pushState,
	},
	
	init : function() {
		window.onpopstate = ThePage.handleBrowserNavigation;
		
		if (location.search) {
			if (ThePage.s.supportsHistory && history.state !== null) {
				ThePage.gifSoundFromParams(history.state);
			} else {
				ThePage.gifSoundFromParams(ThePage.readURLParams(location.search.substring(1)));
			}
		}
	},
	
	// Creates GifSound from parameters object
	gifSoundFromParams : function(URLParams) {
		var gifPlugin, soundPlugin, gifID, soundID, startTime,
		foundGifPlugin   = false,
		foundSoundPlugin = false,
		foundStartTime   = false;
		
		$.each(URLParams, function(paramName, paramValue) {
			paramValue = String(paramValue);
			
			if (!foundGifPlugin && GifSound.s.gifPlugins.hasOwnProperty(paramName) && GifSound.s.gifPlugins[paramName].verifyParam(paramValue)) {
				foundGifPlugin = true;
				
				gifPlugin = paramName;
				gifID     = paramValue;
			} else if (!foundSoundPlugin && GifSound.s.soundPlugins.hasOwnProperty(paramName) && GifSound.s.soundPlugins[paramName].verifyParam(paramValue)) {
				foundSoundPlugin = true;
				
				soundPlugin = paramName;
				soundID     = paramValue;
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
		var paramObject = {},
		paramStrings    = paramsString.split('&');
		
		paramStrings.forEach(function(singleParam) {
			var param = singleParam.split('=', 2);
			
			if (param.length == 2 && param[0] && param[1]) {
				paramObject[param[0]] = decodeURIComponent(param[1]).replace(ThePage.s.matchComplexCharacters, '');
			}
		});
		
		return paramObject;
	},
	
	handleBrowserNavigation : function(event) {
		UserNotifications.clearNotifications();
		console.log(event);
		if (event.state !== null) {
			ThePage.gifSoundFromParams(event.state);
		} else {
			GifSound.removeGifSound();
		}
	},
	
	// If the URL can be dynamically changed via HTML5 History API
	supportsHistory : function() {
		return ThePage.s.supportsHistory;
	},
	
	// Updates the current URL using either the HTML5 History API or just setting the URL forcing a page reload
	updateURL : function(gifID, soundID, gifPlugin, soundPlugin, startTime) {
		var params = {};
		
		params[gifPlugin]   = gifID;
		params[soundPlugin] = soundID;
		
		if (startTime !== 0) {
			params.st = startTime;
		}
		
		var paramString = '?' + $.param(params, true);
		
		if (ThePage.s.supportsHistory) {
			// Dynamically updates URL but only if it's a new page
			if (paramString !== location.search) {
				history.pushState(params, '', paramString);
			}
		} else {
			// Causes browser to reload
			location.search = paramString;
		}
	},
};

// Handles the display area and thus the current gif and sound plugins
GifSound = {
	s : {
		gifPlugins         : {
			'gifv' : GifvPlugin,
			'gif'  : GifPlugin,
		},
		soundPlugins       : {
			'yt'   : YTPlugin,
			'sc'   : SCPlugin,
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
		gifID              : '',
		soundID            : '',
		startTime          : 0,
		updateURL          : false,
	},
	
	createGifSound : function(gifID, soundID, gifPlugin, soundPlugin, startTime, updateURL) {
		GifSound.setGifState('loading');
		GifSound.setSoundState('loading');
		
		GifSound.s.gifReady   = false;
		GifSound.s.soundReady = false;
		
		GifSound.s.gifID      = gifID;
		GifSound.s.soundID    = soundID;
		GifSound.s.startTime  = startTime;
		
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
		
		if (typeof updateURL === 'boolean' && updateURL) {
			GifSound.s.updateURL = true;
		} else {
			GifSound.s.updateURL = false;
		}
	},
	
	// Clears GifSound area. Media plugins should never touch this
	removeGifSound : function() {
		GifSound.setGifState('blank');
		GifSound.setSoundState('blank');
		
		GifSound.s.currentGifPlugin = '';
		GifSound.s.currentSoundPlugin = '';
		
		GifSound.s.gifWrapper.html('');
		GifSound.s.soundWrapper.html('');
	},
	
	// Adds GifSound to page's URL parameters (if necessary)
	updateURL : function() {
		if (GifSound.s.updateURL) {
			ThePage.updateURL(GifSound.s.gifID, GifSound.s.soundID, GifSound.s.currentGifPlugin, GifSound.s.currentSoundPlugin, GifSound.s.startTime);
		}
	},
	
	updateGifID : function(gifID) {
		GifSound.s.gifID = gifID;
	},
	
	updateSoundID : function(soundID) {
		GifSound.s.soundID = soundID;
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
			
			// Adds GifSound to page's URL parameters (if necessary)
			GifSound.updateURL();
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