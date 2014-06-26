Promise.all([
new Promise(function(ready) {
	chrome.storage.local.get("egvrecords", function(values) {
		ready(values.egvrecords);
	});
})
]).then(function(o) {
	var data = o[0];
	var days = 7;
	var config = { low: 70, high: 180 };
	var sevendaysago = Date.now() - days.days();
	var report = $("#report");
	var minForDay, maxForDay;
	var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"];

	data = data.filter(function(record) {
		return record.displayTime > sevendaysago;
	});
	var table = $("<table>");
	var thead = $("<tr/>");
	$("<th></th>").appendTo(thead);
	$("<th>Date</th>").appendTo(thead);
	$("<th>Lows</th>").appendTo(thead);
	$("<th>Normal</th>").appendTo(thead);
	$("<th>High</th>").appendTo(thead);
	$("<th>Readings</th>").appendTo(thead);
	$("<th>Min</th>").appendTo(thead);
	$("<th>Max</th>").appendTo(thead);
	$("<th>StDev</th>").appendTo(thead);
	$("<th>25%</th>").appendTo(thead);
	$("<th>Median</th>").appendTo(thead);
	$("<th>75%</th>").appendTo(thead);
	thead.appendTo(table);

	[7,6,5,4,3,2,1].forEach(function(day) {
		var tr = $("<tr>");
		var dayInQuestion = new Date(Date.now() - (day).days());
		dayInQuestion.setSeconds(0);
		dayInQuestion.setMinutes(0);
		dayInQuestion.setHours(0);
		dayInQuestion.setMilliseconds(0);
		var dayEnds = new Date(dayInQuestion).getTime() + (1).days();



		var daysRecords = data.filter(function(r) {
			return r.displayTime >= dayInQuestion.getTime() && r.displayTime <= dayEnds;
		});
		minForDay = daysRecords[0].bgValue;
		maxForDay = daysRecords[0].bgValue;
		var stats = daysRecords.reduce(function(out, record) {
			if (record.bgValue < config.low) {
				out.lows++;
			} else if (record.bgValue < config.high) {
				out.normal++;
			} else {
				out.highs++;
			}
			if (minForDay > record.bgValue) minForDay = record.bgValue;
			if (maxForDay < record.bgValue) maxForDay = record.bgValue;
			return out;
		}, {
			lows: 0,
			normal: 0,
			highs: 0
		});
		var bgValues = daysRecords.map(function(r) { return r.bgValue; });
		$("<td><div id=\"chart" + day.toString() + "\" class=\"inlinepiechart\"></div></td>").appendTo(tr);
		setTimeout(function() {
			var inrange = [
				{
					label: "Low",
					data: Math.floor(stats.lows * 1000 / daysRecords.length) / 10
				},
				{
					label: "In range",
					data: Math.floor(stats.normal * 1000 / daysRecords.length) / 10
				},
				{
					label: "High",
					data: Math.floor(stats.highs * 1000 / daysRecords.length) / 10
				}
			];
			$.plot(
				"#chart" + day.toString(),
				inrange,
				{
					series: {
						pie: {
							show: true
						}
					},
					colors: ["#f88", "#8f8", "#ff8"]
				}
			);
		}, 50);
		$("<td>" + (months[dayInQuestion.getMonth()] + " " + dayInQuestion.getDate()) + "</td>").appendTo(tr);
		$("<td>" + Math.floor((100 * stats.lows) / daysRecords.length) + "%</td>").appendTo(tr);
		$("<td>" + Math.floor((100 * stats.normal) / daysRecords.length) + "%</td>").appendTo(tr);
		$("<td>" + Math.floor((100 * stats.highs) / daysRecords.length) + "%</td>").appendTo(tr);
		$("<td>" + daysRecords.length +"</td>").appendTo(tr);
		$("<td>" + minForDay +"</td>").appendTo(tr);
		$("<td>" + maxForDay +"</td>").appendTo(tr);
		$("<td>" + Math.floor(ss.standard_deviation(bgValues)) + "</td>").appendTo(tr);
		$("<td>" + ss.quantile(bgValues, 0.25) + "</td>").appendTo(tr);
		$("<td>" + ss.quantile(bgValues, 0.5) + "</td>").appendTo(tr);
		$("<td>" + ss.quantile(bgValues, 0.75) + "</td>").appendTo(tr);



		table.append(tr);
	});

	report.append(table);

});