
import _ from 'lodash';
import printMe from './print.js';
import Ganglion from 'ganglion-ble';

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

let ganglion;

const onConnectClick = async () => {
    ganglion = new Ganglion();
    await ganglion.connect();
    await ganglion.start();
    ganglion.stream.subscribe(sample => {
        console.log('sample', sample);
    });
};

const onDisconnectClick = async () => {
    ganglion.disconnect();
};

document.getElementById('connect')
    .addEventListener('click', onConnectClick);

document.getElementById('disconnect')
    .addEventListener('click', onDisconnectClick);

document.body.appendChild(component());