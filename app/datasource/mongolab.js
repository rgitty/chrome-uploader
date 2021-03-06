define(["../waiting"], function(waiting) {
	// http://stackoverflow.com/a/8462701
	function formatFloat(num,casasDec,sepDecimal,sepMilhar) {
		if (num < 0)
		{
			num = -num;
			sinal = -1;
		} else
			sinal = 1;
		var resposta = "";
		var part = "";
		if (num != Math.floor(num)) // decimal values present
		{
			part = Math.round((num-Math.floor(num))*Math.pow(10,casasDec)).toString(); // transforms decimal part into integer (rounded)
			while (part.length < casasDec)
				part = '0'+part;
			if (casasDec > 0)
			{
				resposta = sepDecimal+part;
				num = Math.floor(num);
			} else
				num = Math.round(num);
		} // end of decimal part
		while (num > 0) // integer part
		{
			part = (num - Math.floor(num/1000)*1000).toString(); // part = three less significant digits
			num = Math.floor(num/1000);
			if (num > 0)
				while (part.length < 3) // 123.023.123  if sepMilhar = '.'
					part = '0'+part; // 023
			resposta = part+resposta;
			if (num > 0)
				resposta = sepMilhar+resposta;
		}
		if (sinal < 0)
			resposta = '-'+resposta;
		return resposta;
	}

	var formatDate = function(d) {
		return (d.getFullYear()) + "/" + (d.getMonth() + 1) + "/" + d.getDate() + " " + d.getHours() + ":" + d.getMinutes();
	};

	var structureData = function(plot) {
		return {
			device: "dexcom",
			date: plot.displayTime,
			dateString: formatDate(new Date(plot.displayTime)),
			sgv: formatFloat(plot.bgValue, 2, "."),
			direction: plot.trend
		};
	};

	var formatData = function(plot) {
		return JSON.stringify(structureData(plot));
	};
	var mongolabUrl = "https://api.mongolab.com/api/1/databases/";

	var mongolab = { };
	mongolab.insert = function(plot) {
		if (!plot) return;
			
		(new Promise(function(done) {
			chrome.storage.local.get("config", function(local) {
				done(local.config || {});
			});
		})).then(function(config) {
			// have a unique constraint on date to keep it from inserting too much data.
			// mongolab returns a 400 when duplicate attempted

			console.log("[mongolab] Writing most recent record to MongoLab");
			if (!("mongolab" in config)) return;
			if (!("apikey" in config.mongolab && config.mongolab.apikey.length > 0)) return;
			if (!("collection" in config.mongolab && config.mongolab.collection.length > 0)) return;
			if (!("database" in config.mongolab && config.mongolab.database.length > 0)) return;

			$.ajax({
				url: mongolabUrl + config.mongolab.database + "/collections/" + config.mongolab.collection + "?apiKey=" + config.mongolab.apikey,
				data: formatData(plot),
				type: "POST",
				contentType: "application/json"
			});
		});
	};

	mongolab.populateLocalStorage = function() {
		waiting.show("Downloading from Mongolab");
		return new Promise(function(complete) {
			(new Promise(function(done) {
				chrome.storage.local.get("config", function(local) {
					done(local.config || {});
				});
			})).then(function(config) {
				// have a unique constraint on date to keep it from inserting too much data.
				// mongolab returns a 400 when duplicate attempted

				console.log("[mongolab] Requesting all data from MongoLab");
				if (!("mongolab" in config)) return;
				if (!("apikey" in config.mongolab && config.mongolab.apikey.length > 0)) return;
				if (!("collection" in config.mongolab && config.mongolab.collection.length > 0)) return;
				if (!("database" in config.mongolab && config.mongolab.database.length > 0)) return;

				// get count (can't transfer more than 1000 at a time)
				$.getJSON(mongolabUrl + config.mongolab.database + "/collections/" + config.mongolab.collection + "?c=true&apiKey=" + config.mongolab.apikey).then(function(total) {
					var requests = [];
					do {
						requests.push(mongolabUrl + config.mongolab.database + "/collections/" + config.mongolab.collection + "?apiKey=" + config.mongolab.apikey + "&l=1000&sk=" + 1000 * requests.length);
						total -= 1000;
					} while (total > 0);
					Promise.all(requests.map(function(url) {
						return $.getJSON(url);
					})).then(function() {
						var data = [];
						var args = Array.prototype.slice.call(arguments, 0);
						while (args.length) data = Array.prototype.concat.apply(data, args.shift());

						chrome.storage.local.get("egvrecords", function(local) {
							var records = (local.egvrecords || []).concat(data.map(function(record) {
								return {
									displayTime: Date.parse(record.dateString),
									bgValue: record.sgv,
									trend: record.direction
								};
							}));
							records.sort(function(a,b) {
								return a.displayTime - b.displayTime;
							});
							records = records.filter(function(rec, ix, all) {
								if (ix === 0) return true;
								return all[ix - 1].displayTime != rec.displayTime;
							});

							chrome.storage.local.set({ egvrecords: records }, console.debug.bind(console, "[mongolab] grabbed all records from interwebs"));
							complete({ new_records: records, raw_data: data });
							waiting.hide();
						});
					});
				});
			});
		});
	};

	mongolab.publish = function(records) {
		waiting.show("Sending entire history to MongoLab");
		return new Promise(function(complete) {
			(new Promise(function(done) {
				chrome.storage.local.get("config", function(local) {
					done(local.config || {});
				});
			})).then(function(config) {
				// have a unique constraint on date to keep it from inserting too much data.
				// mongolab returns a 400 when duplicate attempted

				console.log("[mongolab] Publishing all data to MongoLab");
				if (!("mongolab" in config)) return;
				if (!("apikey" in config.mongolab && config.mongolab.apikey.length > 0)) return;
				if (!("collection" in config.mongolab && config.mongolab.collection.length > 0)) return;
				if (!("database" in config.mongolab && config.mongolab.database.length > 0)) return;

				var record_sections = [];
				do {
					record_sections.push(records.slice(record_sections.length * 1000, (record_sections.length + 1) * 1000));
				} while ((record_sections.length * 1000) < records.length);

				Promise.all(record_sections.map(function(records) {
					return $.ajax({
						url: mongolabUrl + config.mongolab.database + "/collections/" + config.mongolab.collection + "?apiKey=" + config.mongolab.apikey,
						data: JSON.stringify(records.map(structureData)),
						type: "POST",
						contentType: "application/json"
					});
				})).then(function() {
					waiting.hide();
					complete();
				});
			});
		});
	};

	mongolab.testConnection = function(apikey, databasename, collectionname) {
		return new Promise(function(ok, fail) {
			$.getJSON(mongolabUrl + "?apiKey=" + apikey).then(function(r) {
				// db ok
				if (r.filter(function(ml_db_name) {
					return ml_db_name == databasename;
				}).length > 0) {
					$.getJSON(mongolabUrl + databasename +  "/collections?apiKey=" + apikey).then(function(r) {
						// db ok
						if (r.filter(function(ml_col_name) {
							return ml_col_name == collectionname;
						}).length > 0) {
							ok();
						} else {
							fail({ error: "Bad collection name", type: "collection", avlb: r.filter(function(choice) {
								return choice.substr(0,7) !== "system.";
							}), selected: collectionname });
						}
					}, function(r) {
						// db fail
						fail({ error: "Bad API Key", type: "apikey", avlb: [], selected: apikey });
					});
				} else {
					fail({ error: "Bad database name", type: "database", avlb: r, selected: databasename });
				}
			}, function(r) {
				// db fail
				fail({ error: "Bad API Key", type: "apikey", avlb: [], selected: apikey });
			});
		});
	};

	// updated database
	chrome.storage.onChanged.addListener(function(changes, namespace) {
		if ("egvrecords" in changes)  {
			mongolab.insert(changes.egvrecords.newValue[changes.egvrecords.newValue.length - 1]);
		}
	});

	return mongolab;
});
