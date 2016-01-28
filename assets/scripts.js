/*
 * The primary objects of concern are:
 * TheGif       - Handles the embedded animation (gif, gifv, webm, etc.)
 * TheSound     - Handles the embedded audio (YouTube, SoundCloud, Vocaroo, mp3 file, etc.)
 * TheForm      - Handles the forms elements and its submission
 * GifSound     - Handles the whole page and calling relevant objects from above
 * If you think any of this sucks then please fork it.
 * I continue to suck at JavaScript I just can't stop writing it.
 */
var TheGif, TheSound, TheForm, GifSound, UserNotifications;

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
		
		GifSound.reset();
		UserNotifications.clearNotifications();
		
		var gifURL            = TheForm.processURL(TheForm.s.gifInput.val()),
		soundURL              = TheForm.processURL(TheForm.s.soundInput.val()),
		startTime             = parseInt(TheForm.s.startTimeInput.val()),
		foundGifPlugin        = false,
		foundSoundPlugin      = false;
		
		if (isNaN(startTime)) {
			startTime = 0;
		}
		
		$.each(GifSound.s.gifPlugins, function(i, plugin) {
			if (plugin.recogniseURL(gifURL)) {
				TheGif         = plugin;
				foundGifPlugin = true;
				return false;
			}
		});
		
		if (!foundGifPlugin) {
			GifSound.gifFailed('No plugin could handle the given URL. Try using Imgur');
			return;
		}
		
		$.each(GifSound.s.soundPlugins, function(i, plugin) {
			if (plugin.recogniseURL(soundURL)) {
				TheSound         = plugin;
				foundSoundPlugin = true;
				return false;
			}
		});
		
		if (!foundSoundPlugin) {
			GifSound.soundFailed('No plugin could handle the given URL. Try using YouTube');
			return;
		}
		
		GifSound.gifLoading();
		GifSound.soundLoading();
		
		TheGif.embedGifByURL(gifURL, GifSound.s.gifWrapper);
		TheSound.embedSoundByURL(soundURL, GifSound.s.soundWrapper, startTime);
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
		regex   : /^(?:http|https):\/\/(?:[^?#]*\.(?:gif))$/i, // Via http://stackoverflow.com/a/169631/3565450
		img     : false,
	},
	
	recogniseURL : function(url) {
		var match = url.match(GifPlugin.s.regex);
		
		if (match) {
			return true;
		} else {
			return false;
		}
	},
	
	embedGifByParam : function(url, wrapper) {
		url = 'http://' + url;
		
		if (GifPlugin.recogniseURL(url)) {
			GifPlugin.embedGifByURL(url, wrapper);
		} else {
			GifSound.gifFailed("Didn't recognise a URL");
		}
	},
	
	embedGifByURL : function(url, wrapper) {
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
			return true;
		} else {
			return false;
		}
	},
	
	recogniseImgurID : function(ID) {
		var match = ID.match(GifvPlugin.s.IDRegex);
		
		if (match) {
			return true;
		} else {
			return false;
		}
	},
	
	// Given an Imgur URL, returns image ID
	getImgurID : function(url) {
		return url.match(GifvPlugin.s.regex)[1];
	},
	
	// Given an Imgur URL, embeds gifv player to given wrapper
	embedGifByURL : function(url, wrapper) {
		GifvPlugin.embedGifByImgurID(GifvPlugin.getImgurID(url), wrapper);
	},
	
	// If ID contains an Imgur image ID, embeds gifv player to wrapper
	embedGifByParam : function(ID, wrapper) {
		if (GifvPlugin.recogniseImgurID(ID)) {
			GifvPlugin.embedGifByImgurID(ID, wrapper);
		} else {
			GifSound.gifFailed('Not an Imgur.com image ID')
		}
	},
	
	// Embeds gifv player of given Imgur image ID to wrapper
	embedGifByImgurID : function(imgurID, wrapper) {
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
 */
YTPlugin = {
	s : {
		URLRegex  : /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([a-zA-Z0-9_-]{11}).*/, // Improved from http://stackoverflow.com/a/8260383/3565450
		IDRegex   : /^[a-zA-Z0-9_-]{11}$/,
		videoId   : '',    // .e.g dQw4w9WgXcQ
		startTime : 0,
		length    : 0,
		wrapper   : false,
		player    : false,
		apiLoading: false, // Whether the YouTube IFrame Player API has started asynchronously loading
		apiLoaded : false, // Whether the YouTube IFrame Player API has been loaded
	},
	
	// Gets video ID of YouTube URL
	getVideoID : function(url) {
		return url.match(YTPlugin.s.URLRegex)[1];
	},
	
	// Checks if URL matches a YouTube video
	recogniseURL : function(url) {
		var match = url.match(YTPlugin.s.URLRegex);
		
		if (match) {
			YTPlugin.s.videoID = match[1];
			return true;
		} else {
			return false;
		}
	},
	
	recogniseYouTubeID(ID) {
		var match = ID.match(YTPlugin.s.IDRegex);
		
		if (match) {
			return true;
		} else {
			return false;
		}
	},
	
	embedSoundByParam : function(videoID, wrapper, startTime) {
		if (YTPlugin.recogniseYouTubeID(videoID)) {
			YTPlugin.embedYouTubeVideo(videoID, wrapper, startTime);
		} else {
			GifSound.soundFailed('Not a valid YouTube video ID');
		}
	},
	
	embedSoundByURL : function(url, wrapper, startTime) {
		YTPlugin.embedYouTubeVideo(YTPlugin.getVideoID(url), wrapper, startTime);
	},
	
	embedYouTubeVideo : function(videoID, wrapper, startTime) {
		// Resets variable changed if video has been previously embedded
		YTPlugin.s.firstPlay = true;
		YTPlugin.s.player    = false;
		
		YTPlugin.s.videoId   = videoID;
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
			
			window.onYouTubeIframeAPIReady = function() {
				YTPlugin.s.apiLoaded  = true;
				YTPlugin.s.apiLoading = false;
				YTPlugin.loadVideo();
			}
		}
	},
	
	// Loads video via YT API. Assumes API has been loaded
	loadVideo : function() {
		YTPlugin.s.wrapper.html('<div id="youtube-embed"/>');
		
		YTPlugin.s.player = new YT.Player('youtube-embed', {
			height       : '300',
			width        : '300',
			videoId      : YTPlugin.s.videoId,
			playerVars   : {
				'autoplay'       : 1,
				'controls'       : 1,
				'modestbranding' : 1, // Removes some YT branding
				'showinfo'       : 0, // Don't show video info (at top of embed)
				'rel'            : 0, // Don't show related videos
				'fs'             : 0, // Disallow fullscreen
				'loop'           : 1,
				'playlist'       : YTPlugin.s.videoId,
				'start'          : YTPlugin.s.startTime,
			},
			events       : {
				'onReady'       : YTPlugin.onPlayerReady,
				'onStateChange' : YTPlugin.playerStateChange,
				'onError'       : YTPlugin.onError,
			},
		});
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
			case 2:
				explanation = "Invalid Video ID (you shouldn't be able to see this error)"
			break;
			
			case 5:
				explanation = 'HTML5 YouTube player error';
			break;
			
			case 100:
				explanation = 'Video not found (removed or private). Probably copyright takedown';
			break;
			
			// 150 is the same as 101. It's just a 101 error in disguise!
			case 101:
			case 150:
				explanation = 'Video owner not allowing it to be played in embedded players';
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

// Handles the display area and thus the current gif and sound plugins
GifSound = {
	s : {
		gifPlugins     : {
			'gif'  : GifPlugin,
			'gifv' : GifvPlugin,
		},
		soundPlugins   : {
			'yt'   : YTPlugin,
		},
		gifStates      : {
			loading : $('#gif-area > .loading'),
			ready   : $('#gif-area > .ready'),
			display : $('#gif-area > .display'),
			error   : $('#gif-area > .error'),
		},
		soundStates    : {
			loading : $('#sound-area > .loading'),
			ready   : $('#sound-area > .ready'),
			display : $('#sound-area > .display'),
			error   : $('#sound-area > .error'),
		},
		gifState       : 'blank',     // Whether the gif display is showing nothing, loading spinner, ready text, the gif itself or an error
		soundState     : 'blank',
		gifWrapper     : $('#gif-wrapper'),
		soundWrapper   : $('#sound-wrapper'),
		gifReady       : false,
		soundReady     : false,
	},
	
	init : function() {
		// If there's no parameters there's no GifSound to make
		if (!location.search) {
			return;
		}
		
		var i            = 0,
		foundSoundPlugin = false,
		foundGifPlugin   = false,
		foundStartTime   = false,
		paramBlocks      = location.search.substring(1).split('&'), // Parses URL parameters into 'foo=bar' strings
		startTime        = 0,
		gifParam,
		soundParam;
		
		// Tries matching URL parameters to gif and sound plugins
		while (paramBlocks[i] && !(foundGifPlugin && foundSoundPlugin && foundStartTime)) {
			var param = paramBlocks[i].split('=', 2);
			
			if (!foundGifPlugin && GifSound.s.gifPlugins.hasOwnProperty(param[0])) {
				foundGifPlugin = true;
				
				TheGif   = GifSound.s.gifPlugins[param[0]];
				gifParam = param[1];
			} else if (!foundSoundPlugin && GifSound.s.soundPlugins.hasOwnProperty(param[0])) {
				foundSoundPlugin = true;
				
				TheSound   = GifSound.s.soundPlugins[param[0]];
				soundParam = param[1];
			} else if (!foundStartTime && param[0] === 'st') {
				startTime = parseInt(param[1]);
				
				if (isNaN(startTime)) {
					startTime = 0;
				}
			}
			
			++i;
		}
		
		if (!foundGifPlugin || !foundSoundPlugin) {
			UserNotifications.displayError('Failed to find an appropriate media plugin');
			
			return;
		}
		
		TheGif.embedGifByParam(gifParam, GifSound.s.gifWrapper);
		TheSound.embedSoundByParam(soundParam, GifSound.s.soundWrapper, startTime);
	},
	
	// Clears gif/sound embeds
	reset : function() {
		GifSound.setGifState('blank');
		GifSound.setSoundState('blank');
		
		// Clears previous embeds, if necessary
		if (typeof TheGif === 'object' | typeof TheSound === 'object') {
			GifSound.s.gifWrapper.html('');
			GifSound.s.soundWrapper.html('');
		}
		
		GifSound.s.gifReady   = false;
		GifSound.s.soundReady = false;
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
	
	gifLoading : function() {
		GifSound.setGifState('loading');
	},
	
	soundLoading: function() {
		GifSound.setSoundState('loading');
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

GifSound.init();
TheForm.init();

});