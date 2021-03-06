/* Global Imports */
var dblite = require('dblite'),
	fs = require('fs'),
	path = require('path'),
	file_utils = require('../../lib/utils/file-utils'),
	ajax_utils = require('../../lib/utils/ajax-utils'),
	app_cache_handler = require('../../lib/handlers/app-cache-handler'),
	config = require('../../lib/handlers/configuration-handler').getConfiguration(),
	album_title_cleaner = require('../../lib/utils/title-cleaner');

/* Variables */
// Init Database
if(config.platform === 'OSX'){
	dblite.bin = "./bin/sqlite3/osx/sqlite3";
}else {
	dblite.bin = "./bin/sqlite3/sqlite3";
}
var db = dblite('./lib/database/mcjs.sqlite');

db.on('info', function (text) { console.log(text) });
db.on('error', function (err) { console.error('Database error: ' + err) });

/* Public Methods */

/**
 * Fetches the Metadata for the specified Album from discogs.org.
 * @param albumTitle         The Title of the Album
 * @param callback           The Callback
 */
exports.fetchMetadataForAlbum = function(albumTitle, callback) {
    var tracks = [];
    var albumPathTitle = config.musicpath + albumTitle;
	var albumInfo = album_title_cleaner.cleanupTitle(albumTitle);
	albumTitle = albumInfo.title;
    
	app_cache_handler.ensureCacheDirExists('music', albumTitle);
    
	loadMetadataFromDatabase(albumTitle, function (result) {
		if (result) {
			// Album is already in the database.
			callback(result);
			return;
		}
        // New Album. Fetch Metadata...
        fetchMetadataFromDiscogs(albumTitle, albumInfo.year, function(err, result) {
            if (err) {
                console.error(err);
                callback([]);
            }   
            
            var thumb_url = null;
            if(result !== null){
                thumb_url = result.thumb;
            }
            
            downloadAlbumFanart(thumb_url, albumTitle, function(err) {
            
                var genre = 'Unknown',
                    title = albumTitle,
                    year = 'Unknown',
                    thumb_path = '/music/css/img/nodata.jpg';
    
                if(result !== null){
                    thumb_url = result.thumb;
                    title = result.title;
                    year = result.year
                    if(result.genre.length){
                        genre = result.genre[0];
                    }
                }
                
                if (err) {
                    console.error(err);
                } else {
                    
                    if(thumb_url !== null){
                        thumb_path = app_cache_handler.getFrontendCachePath('music', albumTitle, path.basename(thumb_url));
                    }
                }

                console.log(albumPathTitle)
                file_utils.getLocalFiles(albumPathTitle, new RegExp("\.(mp3)","g"), function (err, files) {
    
                    tracks = [];
                    for(var i = 0, l = files.length; i < l; ++i){
                        var track = files[i].file;
                        tracks.push(track);
                    }
                    
                    var metadata = [ albumTitle, title, thumb_path, year,
                        genre, JSON.stringify(tracks, null, false) ];
                    storeMetadataInDatabase(metadata, function() {
                        loadMetadataFromDatabase(albumTitle, callback);
                    });
                });
            });
        });
        
	});
};

/* Private Methods */

loadMetadataFromDatabase = function(albumTitle, callback) {
	db.query('SELECT * FROM music WHERE filename = ? ', [ albumTitle ], {
			filename	: String,
			title		: String,
			cover		: String,
			year		: String,
			genre		: String,
			tracks		: JSON.parse
		},
		function(rows) {
			if (typeof rows !== 'undefined' && rows.length > 0){
				console.log('found info for album' .green);
				callback(rows);
			} else {
				console.log('new album' .green);
				callback(null);
			}
		}
	);
};

storeMetadataInDatabase = function(metadata, callback) {
	console.log('Writing data to table for', metadata[0] .green);
    
	db.query('INSERT OR REPLACE INTO music VALUES(?,?,?,?,?,?)', metadata);
	callback();
};

fetchMetadataFromDiscogs = function(albumTitle, year, callback) {
	var apiUrl = "http://api.discogs.com/database/search?q=" + albumTitle + "&type=release&callback=";
	ajax_utils.xhrCall(apiUrl, function(response) {
		var requestResponse = JSON.parse(response),
			requestInitialDetails = requestResponse.results[0];

		if (requestInitialDetails) {
			callback(null, requestInitialDetails)
		} else {
			callback('Unknown file or album, writing fallback', null);
		}
	});
};

downloadAlbumFanart = function(thumb_path, albumTitle, callback) {
	if (thumb_path) {
		var path = require('path');
		try {
			app_cache_handler.downloadDataToCache('music', albumTitle, thumb_path, function(err) {
				if (err) {
					callback(err);
				} else {
					callback(null);
				}
			});
		} catch (exception) {
			callback(exception);
		}
	} else {
		callback('No Thumbnail-Path specified!');
	}
};
