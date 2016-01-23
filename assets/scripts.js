/*
 * The primary objects of concern are:
 * theGif       - Handles the embedded animation (gif, gifv, webm, etc.)
 * theSound     - Handles the embedded audio (YouTube, SoundCloud, Vocaroo, mp3 file, etc.)
 * theForm      - Handles the forms elements and its submission
 * gifSound     - Handles the whole page and calling relevant objects from above
 * If you think any of this sucks then please fork it.
 * I continue to suck at JavaScript I just can't stop writing it.
 */
var theGif, theSound, theForm, gifSound;

$(function(){

theForm = {
	s: {
		form           : $('form#gifsound-input'),
		gifInput       : $('input#gif-url'),
		soundInput     : $('input#sound-url'),
		startTimeInput : $('input#sound-start-time'),
		makeButton     : $('a#make-gifsound'),
		urlSanitizer   : /[^-A-Za-z0-9\+&@#\/%?=~_|!:,.;\(\)]/g, // Via stackoverflow.com/a/205967/3565450
	},
	
	init: function() {
		this.bindUIHandlers();
	},
	
	bindUIHandlers : function() {
		this.s.form.submit(theForm.formSubmission);
	},
	
	formSubmission : function(event) {
		event.preventDefault();
		
		// Hides all overlays in case form was submitted mid-way through loading
		gifSound.s.gifSpinner.hide();
		gifSound.s.gifReadyText.hide();
		gifSound.s.soundSpinner.hide();
		gifSound.s.soundReadyText.hide();
		
		// Clears previous embeds, if necessary
		if (typeof theGif === 'object' | typeof theSound === 'object') {
			gifSound.s.gifWrapper.html('');
			gifSound.s.soundWrapper.html('');
		}
		
		// Resets
		gifSound.s.gifReady   = false;
		gifSound.s.soundReady = false;
		
		theForm.processSoundURL(theForm.s.soundInput.val(), theForm.s.startTimeInput.val());
		theForm.processGifURL(theForm.s.gifInput.val());
	},
	
	sanitizeURL : function(url) {
		return url.replace(theForm.s.urlSanitizer, '');
	},
	
	processGifURL : function(gifURL) {
		gifURL = theForm.sanitizeURL(gifURL);
		
		$.each(gifSound.s.gifPlugins, function(i, plugin) {
			if (plugin.recogniseURL(gifURL)) {
				theGif = plugin;
				return true;
			}
		});
		
		if (typeof theGif === 'object') {
			gifSound.gifLoading();
			theGif.embedGif(gifURL, gifSound.s.gifWrapper);
		} else {
			throw "I don't have a media plugin that can handle that gif URL";
		}
	},
	
	processSoundURL : function(soundURL, startTime) {
		soundURL = theForm.sanitizeURL(soundURL);
		
		startTime = parseInt(startTime);
		
		if (startTime === NaN) {
			startTime = 0;
		}
		
		$.each(gifSound.s.soundPlugins, function(i, plugin) {
			if (plugin.recogniseURL(soundURL)) {
				theSound = plugin;
				return true;
			}
		});
		
		if (typeof theSound === 'object') {
			gifSound.soundLoading();
			theSound.embedSound(soundURL, gifSound.s.soundWrapper, startTime);
		} else {
			throw "I don't have a media plugin that can handle that audio URL";
		}
	},
};

/*
 * SOUND PLUGINS
 * All sound plugins must have the following methods:
 * recogniseURL - Given a URL returns true or false if it can handle that URL
 * embedSound   - Embed appropriate sound player (YouTube embed, <audio> tag, etc.) set to be PAUSED
 * playSound    - Plays embedded sound
 * pauseSound   - Pauses embedded sound
 */

YTPlugin = {
	s : {
		regex     : /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/, // Via http://stackoverflow.com/a/8260383/3565450
		videoId   : '',    // Video ID .e.g dQw4w9WgXcQ
		startTime : 0,
		length    : 0,
		wrapper   : false,
		player    : false,
		apiLoading: false, // Whether the YouTube IFrame Player API has started asynchronously loading
		apiLoaded : false, // Whether the YouTube IFrame Player API has been loaded
	},
	
	// Gets video ID of YouTube URL
	getVideoID : function(url) {
		return url.match(YTPlugin.s.regex)[1];
	},
	
	// Checks if URL matches a YouTube video
	recogniseURL : function(url) {
		var match = url.match(YTPlugin.s.regex);
		
		if (match&&match[1].length == 11) {
			YTPlugin.s.videoID = match[1];
			return true;
		} else {
			return false;
		}
	},
	
	embedSound : function(url, wrapper, startTime) {
		// Resets variable changed if video has been previously embedded
		YTPlugin.s.firstPlay = true;
		YTPlugin.s.player    = false;
		
		
		YTPlugin.s.videoId   = YTPlugin.getVideoID(url);
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
				'autoplay' : 1,
				'controls' : 0,
				'loop'     : 1,
				'playlist' : YTPlugin.s.videoId,
				'start'    : YTPlugin.s.startTime,
			},
			events       : {
				'onReady'       : YTPlugin.onPlayerReady,
				'onStateChange' : YTPlugin.playerStateChange,
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
			gifSound.soundReady();
		} else {
			setTimeout(YTPlugin.readyWhenLoaded, 600);
		}
	},
	
	playSound : function() {
		YTPlugin.s.player.playVideo();
	},
	
	pauseSound : function() {
		YTPlugin.s.player.pauseVideo();
	},
};

/*
 * GIF PLUGINS
 * All gif plugins must have the following methods:
 * recogniseURL - Given a URL returns true or false if it can handle that URL
 * embedGif     - Embed appropriate gif player (Webm player, <img> tag, etc.) set to be PAUSED
 * playGif      - Plays embedded gif
 * pauseGif     - Pauses embedded gif
 */

/*
 * General purpose gif plugin
 * Embeds gifs with an img tag (wow, much difficult)
 */
GifPlugin = {
	s : {
		regex   : /(?:([^:\/?#]+):)?(?:\/\/([^\/?#]*))?([^?#]*\.(?:gif))(?:\?([^#]*))?(?:#(.*))?/, // Via http://stackoverflow.com/a/169631/3565450
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
	
	embedGif : function(url, wrapper) {
		GifPlugin.s.img = $('<img/>',{src:url});
		
		GifPlugin.s.img.hide();
		
		wrapper.html(GifPlugin.s.img);
		
		GifPlugin.s.img.one('load', gifSound.gifReady);
		
		/*
		 * Cache fix for browsers that don't trigger 'load'. Thanks Nick Craver:
		 * http://stackoverflow.com/a/2392448/3565450
		 */
		if (GifPlugin.s.img.complete) {
			GifPlugin.s.img.trigger('load');
		}
	},
	
	playGif : function() {
		GifPlugin.s.img.show();
	},
	
	pauseGif : function() {
		GifPlugin.s.img.hide();
	},
},

/*
 * Plugin to embed Gifvs from imgur.com 
 */
GifvPlugin = {
	s : {
		regex   : /^(http|https):\/\/i\.imgur\.com\/([a-zA-Z0-9]{5,8})\.gifv/,
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
	
	// Gets ID of Imgur Gifv
	getImgurID : function(url) {
		return url.match(GifvPlugin.s.regex)[2];
	},
	
	embedGif : function(url, wrapper) {
		var video = document.createElement('video'),
		source1   = document.createElement('source'),
		source2   = document.createElement('source'),
		imgurID   = GifvPlugin.getImgurID(url),
		srcBase   = 'http://i.imgur.com/' + imgurID;
		
		// ADD FAILURE TEXT
		
		video.loop     = true;
		video.muted    = true;
		
		source1.type = 'video/webm';
		source1.src  = srcBase + '.webm';
		
		source2.type = 'video/mp4';
		source2.src  = srcBase + '.mp4';
		
		
		video.appendChild(source1);
		video.appendChild(source2);
		
		video.addEventListener('canplaythrough', GifvPlugin.videoBuffered, false);
		
		GifvPlugin.s.video = video;
		
		wrapper[0].appendChild(video);
	},
	
	// When browser thinks video is sufficiently buffered for continuous playback
	videoBuffered() {
		GifvPlugin.s.video.removeEventListener('canplaythrough', GifvPlugin.videoBuffered, false);
		
		gifSound.gifReady();
	},
	
	playGif() {
		GifvPlugin.s.video.play();
	},
	
	pauseGif() {
		GifvPlugin.s.video.pause();
	},
},

gifSound = {
	s : {
		soundPlugins   : [YTPlugin],
		gifPlugins     : [GifPlugin, GifvPlugin],
		soundWrapper   : $('div#sound-wrapper'),
		gifWrapper     : $('div#gif-wrapper'),
		soundReady     : false,
		gifReady       : false,
		gifSpinner     : $('div#gif-loading'),
		soundSpinner   : $('div#sound-loading'),
		gifReadyText   : $('p#gif-loaded'),
		soundReadyText : $('p#sound-loaded'),
	},
	
	init : function() {
		this.bindUIHandlers();
	},
	
	bindUIHandlers : function() {
		
	},
	
	gifLoading : function() {
		gifSound.s.gifWrapper.hide();
		gifSound.s.gifSpinner.show();
	},
	
	gifReady : function() {
		console.log('Gif Ready');
		
		gifSound.s.gifReady = true;
		gifSound.s.gifSpinner.hide();
		gifSound.s.gifReadyText.show();
		
		gifSound.playIfSynced();
	},
	
	soundLoading: function() {
		gifSound.s.soundWrapper.hide();
		gifSound.s.soundSpinner.show();
	},
	
	soundReady : function() {
		console.log('Sound Ready');
		
		gifSound.s.soundReady = true;
		gifSound.s.soundSpinner.hide();
		gifSound.s.soundReadyText.show();
		
		gifSound.playIfSynced();
	},
	
	playIfSynced : function() {
		if (gifSound.s.gifReady && gifSound.s.soundReady) {
			console.log('Gif and Sound are synced');
			
			gifSound.s.gifReadyText.hide();
			gifSound.s.soundReadyText.hide();
			
			gifSound.s.gifWrapper.show();
			gifSound.s.soundWrapper.show();
			
			theGif.playGif();
			theSound.playSound();
		}
	}
};

theForm.init();

});