
import _ from 'lodash';
import Ganglion from 'ganglion-ble';
import { voltsToMicrovolts, epoch, fft, alphaPower } from "@neurosity/pipes";
import { interval, Observable, Scheduler } from 'rxjs';
import { withLatestFrom } from 'rxjs/operators';
import './style.css';

// TODO: connect to range control on page
let chosenElectrode = 3;

function drawLine(ctx, ys, startWidth) {
  ctx.beginPath();
  ctx.moveTo(-startWidth*ys.length,0);
  ctx.quadraticCurveTo(0, 0, 0, ys[0]);
  for(let i = 1; i < ys.length; i++) {
    ctx.lineTo(i, ys[i]);
  }
  ctx.quadraticCurveTo(ys.length - 1, 0, ys.length * (1 + startWidth), 0);
  ctx.stroke();
}
const styles = ["blue","red","black","orange"];
function drawTimeseriesFrame(ctx, samples) {
  const sidesRelativeWidth = 1/6; // width of flat-line-ish portion relative to canvas size
  // save state before we mess around with it (specifically transform)
  ctx.save();
  // reset the canvas contents;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // make y=0 point to mid-canvas
  ctx.translate(0, ctx.canvas.height / 2);
  // X coords: make 0 left side, (ys.length + 1) right side
  // (NOTE: implicitly assuming all samples buffers same width, taking width from samples.data[0])
  // Y coords: flip up-down (make positive Y up) and scale so top is +3000, bottom -3000
  ctx.scale((ctx.canvas.width - 1) / (samples.data[0].length - 1), -ctx.canvas.height/800);

  // leave space for the sides
  ctx.scale(1 - 2*sidesRelativeWidth, 1);
  ctx.translate(samples.data[0].length * sidesRelativeWidth, 0);
  /*for (const [i, ys] of samples.data.entries()) {
    ctx.strokeStyle = styles[i];
    ctx.lineWidth = 2;
    drawLine(ctx, ys, sidesRelativeWidth);
  }*/
  ctx.strokeStyle = styles[chosenElectrode];
  ctx.lineWidth = 2;
  drawLine(ctx, samples.data[chosenElectrode], sidesRelativeWidth);  
  // reset all the scaling
  ctx.restore();
}

let sampleCtx = document.getElementById('sampleScreen').getContext('2d');



let ganglion;

let animationFrame = interval(
        0,
        Scheduler.requestAnimationFrame
      );
      //.timestamp();

let ganglionDraw;
let collectSample;
let recordingSubscription;

// TODO: frequency plot - works but unused
/*
let freqCtx = document.getElementById('freqScreen').getContext('2d');
let freqImage = freqCtx.createImageData(600, 128); // TODO
*/

// return promise that resolves in ms milliseconds
function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// TODO: ugh, hard-coded play recording
function recordPlayer(data) {
  let observable = Observable.create(async function (observer) {
    // repeat the file forever
    while(true) {
      const startTimeReal = +new Date;
      const startDataTime = data[0].timestamp;
      let dtReal = (+new Date) - startTimeReal;
      for (const item of data) {
        const dtStream = item.timestamp - startDataTime;
        if (dtStream > dtReal) {
          await timeout(dtStream - dtReal);
          dtReal = (+new Date) - startTimeReal;
        }
        observer.next(item);
      }
    }
  });
  return observable;
}

let recording;
let request = new XMLHttpRequest();
request.open('GET','/recording.json', true);
request.onload = function () {
  console.log("response");
  if ((request.status >= 200) && (request.status < 400)) {
    console.log("got recording");
    recording = recordPlayer(JSON.parse(request.responseText));
    drawFromStream(recording);
  }
};
request.onerror = function(e){
  console.log("error", e);
}
// TODO: comment-out to stop auto-play of recording
request.send();


function drawFromStream(stream) {
    let timeSeries = stream.pipe(
      voltsToMicrovolts(),
      epoch({ duration: 1024, interval: 2 })
    );
    if (ganglionDraw !== undefined) {
      ganglionDraw.unsubscribe();
    }
    ganglionDraw = animationFrame.pipe(
        withLatestFrom(timeSeries)
      ).subscribe(function([ts, samples]) {
        /*console.log(ts, "samples", samples);*/
        drawTimeseriesFrame(sampleCtx, samples);
      });
}

const onConnectClick = async function ()  {
    ganglion = new Ganglion();
    await ganglion.connect();
    await ganglion.start();
    drawFromStream(ganglion.stream);
    /*
    const onSample = function(sample)  {
      //console.log('sample', sample);
    }
    ganglion.stream.subscribe(onSample);
    */

    /*
    let col = 599; // TODO:
    for (let i = 0; i < freqImage.data.length; i += 4) {
      freqImage.data[i + 3] = 255;
    }
    ganglion.stream.pipe(
      voltsToMicrovolts(),
      epoch({ duration: 256, interval: 30 }),
      fft({ bins: 256 })
    ).subscribe(function(samples) {
      for (let i = 0; i < samples.freqs.length; i++) {
        for(let j = 0; j < 3; j++) {
          freqImage.data[(col + i*600)*4 + j] = samples.psd[j][(i/9) | 0];
        }
      }
      col--;
      if (col < 1) { col = 599; } // TODO: better
      freqCtx.putImageData(freqImage, 0, 0);
      //console.log(samples, col);
    });
    */
};

const onStartRecordingClick = function ()  {
  if (ganglion === undefined) {
    console.log('not connected, not recording');
    return;
  }
  console.log('start recording');

  collectSample = [];
  recordingSubscription = ganglion.stream.subscribe(function(sample) {
    collectSample.push(sample);
  });
};

const onStopRecordingClick = async function () {
  console.log("stop recording");
  if (recordingSubscription === undefined) {
    console.log("wasn't recording on stop, doing nothing");
    return;
  }

  recordingSubscription.unsubscribe();
  console.log("collected samples: ", collectSample.length);

  let file = new Blob([JSON.stringify(collectSample)], {type : 'application/json'});
  let a = document.getElementById("save-recording");
  a.href = URL.createObjectURL(file);
  a.download = 'recording.json';
};

const onDisconnectClick = function () {
  onStopRecordingClick();
  ganglion.disconnect();
  if (ganglionDraw !== undefined) {
    ganglionDraw.unsubscribe();
  }
  ganglion = undefined;
};




/////// set up button clicks old-school ////////

document.getElementById('connect')
    .addEventListener('click', onConnectClick);

document.getElementById('disconnect')
    .addEventListener('click', onDisconnectClick);

document.getElementById('start-recording')
    .addEventListener('click', onStartRecordingClick);

document.getElementById('stop-recording')
    .addEventListener('click', onStopRecordingClick);



