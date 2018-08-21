
import _ from 'lodash';
import Ganglion from 'ganglion-ble';
import { voltsToMicrovolts, epoch, fft, alphaPower } from "@neurosity/pipes";
import { interval, Observable, animationFrameScheduler, of } from 'rxjs';
import { withLatestFrom, map } from 'rxjs/operators';
import './style.css';
import '@fortawesome/fontawesome-free/css/all.css';
// TODO: connect to range control on page
let chosenElectrode = 3;

function drawLine(ctx, ys, startWidth) {
  ctx.beginPath();
  // ctx.moveTo(-startWidth*ys.length,0);
  ctx.moveTo(0,ys[0]);
  // ctx.quadraticCurveTo(0, 0, 0, ys[0]);
  for(let i = 1; i < ys.length; i++) {
    ctx.lineTo(i, ys[i]);
  }
  ctx.quadraticCurveTo(ys.length - 1, 0, ys.length * (1 + startWidth), 0);
  ctx.stroke();
}
const styles = ["blue","red","black","orange"];


function makeStyles(lineNum) {
  let result = [];
  for(let i = lineNum-1; i >= 0 ; i -= 1) {
    result.push({
      style: `rgba(255,${255*(1 - Math.pow(i / lineNum, 0.25)) | 0},255,${1 - Math.pow(i / lineNum, 0.25)})`,
      width: 1 + 2*i*i
     });
  }
  return result;
}
const lineNum = 5;
const lineStyles = makeStyles(lineNum);

function drawTimeseriesFrame(ctx, samples) {
  const sidesRelativeWidth = 1/8; // width of flat-line-ish portion relative to canvas size
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
  ctx.scale(1/(1 + 1*sidesRelativeWidth), 1);
  // ctx.translate((samples.data[0].length-1)*sidesRelativeWidth, 0);

  /*for (const [i, ys] of samples.data.entries()) {
    ctx.strokeStyle = styles[i];
    ctx.lineWidth = 2;
    drawLine(ctx, ys, sidesRelativeWidth);
  }*/
  //ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = styles[chosenElectrode];
  ctx.lineJoin = 'round';
  for(let style of lineStyles) {
  //for(let i = lineNum-1; i >= 0 ; i -= 1) {
    //console.log(`rgba(255,0,255,${1 - Math.pow(i / lineNum, 1)})`);
    //ctx.strokeStyle = `rgba(255,${255*(1 - Math.pow(i / lineNum, 0.25)) | 0},255,${1 - Math.pow(i / lineNum, 0.25)})`;
    //ctx.strokeStyle = `rgba(255,${1 - Math.pow(i / lineNum, 1)},255,${0.5 * (1 - Math.pow(i / lineNum, 1))})`;
    //ctx.strokeStyle = `rgb(${255/lineNum | 0},${128*(1 - Math.pow(i / lineNum, 0.5)) | 0},${255/lineNum | 0})`;
    //ctx.strokeStyle = `rgb(${255/lineNum | 0},${128*Math.pow(2, -i) | 0},${255/lineNum | 0})`;
    //ctx.lineWidth = 1 + 2*i*i;
    ctx.strokeStyle = style.style;
    ctx.lineWidth = style.width;
    drawLine(ctx, samples.data[chosenElectrode], sidesRelativeWidth);
    } 
  // reset all the scaling
  ctx.restore();
}

let sampleCtx = document.getElementById('sampleScreen').getContext('2d');



let ganglion;
let animationFrame = interval(
        null,
        animationFrameScheduler
      );

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
  }
};
request.onerror = function(e){
  console.log("error", e);
}
// TODO: comment-out to stop auto-play of recording
request.send();


function drawFromStream(stream) {
  let container = document.getElementById('canvas-container');
  let i = 0;

  let timeSeries = stream.pipe(
    voltsToMicrovolts(),
    epoch({ duration: 1024, interval: 2 }),
    map((item, index) => { item.index = index; return item; })
  );
  if (ganglionDraw !== undefined) {
    ganglionDraw.unsubscribe();
  }
  ganglionDraw = animationFrame.pipe(
      withLatestFrom(timeSeries)
    ).subscribe(function([ts, samples]) {
      if(i<100){console.log(ts, "samples", samples);}
      drawTimeseriesFrame(sampleCtx, samples);
      i++;
      // move background with the line
      //const index = (samples.index*2 / 1023) * (container.offsetWidth*8/9);
      //let newbackground=`background-position: -1px 10px, -${index}px -1px, -1px -8px, -${index}px -1px;`
      //container.style.cssText= newbackground;
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
    let btn = document.getElementById('connect-disconnect');
    btn.classList.add('connected');
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
    ganglionDraw = undefined;
  }
  ganglion = undefined;
  let btn = document.getElementById('connect-disconnect');
  btn.classList.remove('connected');
};

function onConnectDisconnectClick() {
  if (ganglion === undefined) {
    onConnectClick();
  } else {
    onDisconnectClick();
  }
}

function onStartStopRecordingClick() {
  let button = document.getElementById('start-stop-recording');
  if (recordingSubscription === undefined) {
    onStartRecordingClick();
    button.classList.add('recording');
  } else {
    onStopRecordingClick();
    button.classList.remove('recording');
  }
}

function onStartStopPlaybackClick() {
  if (recording === undefined) {
    return;
  }
  let button = document.getElementById('start-stop-playback')
  if (ganglionDraw === undefined) {
    drawFromStream(recording);
    button.classList.add('connected');
  } else {
    ganglionDraw.unsubscribe();
    ganglionDraw = undefined;
    button.classList.remove('connected');
  }
}
/////// set up button clicks old-school ////////

document.getElementById('connect-disconnect')
    .addEventListener('click', onConnectDisconnectClick);

document.getElementById('start-stop-recording')
    .addEventListener('click', onStartStopRecordingClick);

document.getElementById('start-stop-playback')
    .addEventListener('click', onStartStopPlaybackClick);
