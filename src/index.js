
import _ from 'lodash';
import printMe from './print.js';
import Ganglion from 'ganglion-ble';
import { voltsToMicrovolts, epoch, fft, alphaPower } from "@neurosity/pipes";
import { interval } from 'rxjs';
import { Scheduler } from 'rxjs';
import { withLatestFrom } from 'rxjs/operators';

function component() {
  var element = document.createElement('div');
  var btn = document.createElement('button');

  // Lodash, currently included via a script, is required for this line to work
  element.innerHTML = _.join(['Hello', 'webpack'], ' ');

  btn.innerHTML = 'Click me and check the console!';
  btn.onclick = printMe;

  element.appendChild(btn);

  return element;
}

function drawLine(ctx, ys) {
  ctx.beginPath();
  ctx.moveTo(0, ys[0]);
  for(let i = 1; i < ys.length; i++) {
    ctx.lineTo(i, ys[i]);
  }
  ctx.stroke();
}

function drawTimeseriesFrame(ctx, ys) {
  // save state before we mess around with it (specifically transform)
  ctx.save();
  // reset the canvas contents;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // make y=0 point to mid-canvas
  ctx.translate(0, ctx.canvas.height / 2);
  // X coords: make 0 left side, (ys.length - 1) right side
  // Y coords: flip up-down (make positive Y up) and scale so top is +3000, bottom -3000
  ctx.scale((ctx.canvas.width - 1) / (ys.length - 1), -ctx.canvas.height/8000);
  ctx.strokeStyle = 'blue';
  drawLine(ctx, ys);
  // reset all the scaling
  ctx.restore();
}

let sampleCtx = document.getElementById('sampleScreen').getContext('2d');
let freqCtx = document.getElementById('freqScreen').getContext('2d');

let ganglion;

let animationFrame = interval(
        0,
        Scheduler.requestAnimationFrame
      );
      //.timestamp();

let ganglionDraw;

const onConnectClick = async () => {
    ganglion = new Ganglion();
    await ganglion.connect();
    await ganglion.start();
    ganglion.stream.subscribe(sample => {
        //console.log('sample', sample);
    });
    let timeSeries = ganglion.stream.pipe(
      voltsToMicrovolts(),
      epoch({ duration: 256, interval: 84 })
    );

    ganglionDraw = animationFrame.pipe(
        withLatestFrom(timeSeries)
      ).subscribe(([ts, samples]) => {
        /*console.log(ts, "samples", samples);
        drawTimeseriesFrame(sampleCtx, samples.data[0]);
        drawTimeseriesFrame(sampleCtx, samples.data[1]);
        drawTimeseriesFrame(sampleCtx, samples.data[2]);*/
        drawTimeseriesFrame(sampleCtx, samples.data[3]);
      });

    ganglion.stream.pipe(
      voltsToMicrovolts(),
      epoch({ duration: 256, interval: 100 }),
      fft({ bins: 256 }),
      alphaPower()
    ).subscribe(sample => {
        //console.log('alphaPower', sample);
    });
};

const onDisconnectClick = async () => {
    ganglion.disconnect();
    if (ganglionDraw !== undefined) {
      ganglionDraw.unsubscribe();
    }
};

document.getElementById('connect')
    .addEventListener('click', onConnectClick);

document.getElementById('disconnect')
    .addEventListener('click', onDisconnectClick);

document.body.appendChild(component());