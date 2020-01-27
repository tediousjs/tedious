function delay(time, cb) {
    setTimeout(() => {
        cb(time + 1)
    }, time)
}

function* myDelayedMessage(resume) {
    return yield delay(1000, resume);
}

function run(gf) {
    function resume(cbVal) {
        let foo = gfItr.next(cbVal);
        console.log('result', foo.value);
    }

    var gfItr = gf(resume);
    gfItr.next();
}

run(myDelayedMessage)