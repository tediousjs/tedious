function delay(time, cb) {
    setTimeout(() => {
        cb(time + 1)
    }, time)
}

function* myDelayedMessage(resume) {
    return yield delay(1000, resume);
}


function run(gf, cb) {
    function resume(cbVal) {
        cb(gfItr.next(cbVal).value);
    }

    var gfItr = gf(resume);
    gfItr.next();
}

run(myDelayedMessage, (data) => {
    console.log('result ', data)
})