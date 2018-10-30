var Money = require('../../src/data-types/money');
var WritableTrackingBuffer = require('../../src/tracking-buffer/writable-tracking-buffer');

exports.TestValidMoneyValue = function (test)
{
	let validValues = [-922337203685477.5, 922337203685477.5,
	-922337203685477.6 + 0.2, 922337203685477.6 - 0.2, 0, null]
	for (let value of validValues)
	{
		let value2 = Money.validate(value);
		test.equal(value, value2);

		test.doesNotThrow(function ()
		{
			let value2 = Money.validate(value);
			test.equal(value, value2);
		});

		test.doesNotThrow(function ()
		{
			let buf = new WritableTrackingBuffer(8);
			Money.writeParameterData(buf, { value: value });
		});
	}
	test.done();
}

exports.TestInvalidMoneyValue = function(test)
{
	let invalidValues = [Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY,922337203685477.6,922337203685477.6];
	for(let value of invalidValues)
	{
		let ret = Money.validate(value);
		test.ok(ret instanceof TypeError);
	}
	test.done();
}

