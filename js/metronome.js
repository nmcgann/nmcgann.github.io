//metronome.js
//
var audioContext = null;
var unlocked = false;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.
var current16thNote;        // What note is currently last scheduled?
var tempo = 120.0;          // tempo (in beats per minute)
var lookahead = 25.0;       // How frequently to call scheduling function 
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps 
                            // with next interval (in case the timer is late)
var nextNoteTime = 0.0;     // when the next note is due.
var noteResolution = 0;     // 2 == 16th, 1 == 8th, 0 == quarter note **NM changed 16th and quarter
var noteLength = 0.05;      // length of "beep" (in seconds)
var canvas,                 // the canvas element
    canvasContext;          // canvasContext is the canvas' context 2D
var last16thNoteDrawn = -1; // the last "box" we drew on the screen
var notesInQueue = [];      // the notes that have been put into the web audio,
                            // and may or may not have played yet. {note, time}
var timerWorker = null;     // The Web Worker used to fire timer messages
//NM
var noteDisplay;			//the note display element
var notesCyc4 = ["C","F","Bb","Eb","Ab","Db","Gb","B","E","A","D","G"];
var notesRand = ["C","F","Bb/A#","Eb/D#","Ab/G#","Db/C#","Gb/F#","B","E","A","D","G"]; //notesCyc4.slice(0);
var noteCount = 0;

var sequence = 0; 			// 0=none,1=cycle of 4ths, 2=random
var isMuted = false;      	// Are we currently muted?
var gainNode = null;

// First, let's shim the requestAnimationFrame API, with a setTimeout fallback
window.requestAnimFrame = (function(){
    return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function( callback ){
        window.setTimeout(callback, 1000 / 60);
    };
})();

function nextNote() {
    // Advance current note and time by a 16th note...
    var secondsPerBeat = 60.0 / tempo;    // Notice this picks up the CURRENT 
                                          // tempo value to calculate beat length.
    nextNoteTime += 0.25 * secondsPerBeat;    // Add beat length to last beat time

    current16thNote++;    // Advance the beat number, wrap to zero
    if (current16thNote == 16) {
        current16thNote = 0;
    }
}

function scheduleNote( beatNumber, time ) {
    // push the note on the queue, even if we're not playing.
    notesInQueue.push( { note: beatNumber, time: time } );

    if ( (noteResolution==1) && (beatNumber%2))
        return; // we're not playing non-8th 16th notes
    if ( (noteResolution==0) && (beatNumber%4))
        return; // we're not playing non-quarter 8th notes

    // create an oscillator
    var osc = audioContext.createOscillator();
    //osc.connect( audioContext.destination );
	
//NM added mute control
	// Connect the source to the gain node.
	osc.connect(gainNode);
	// Connect the gain node to the destination.
	gainNode.connect(audioContext.destination);

	
    if (beatNumber % 16 === 0)    // beat 0 == high pitch
        osc.frequency.value = 880.0;
    else if (beatNumber % 4 === 0 )    // quarter notes = medium pitch
        osc.frequency.value = 440.0;
    else                        // other 16th notes = low pitch
        osc.frequency.value = 220.0;

    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval, 
    // schedule them and advance the pointer.
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleNote( current16thNote, nextNoteTime );
        nextNote();
    }
}

function play() {
    if (!unlocked) {
      // play silent buffer to unlock the audio
      var buffer = audioContext.createBuffer(1, 1, 22050);
      var node = audioContext.createBufferSource();
      node.buffer = buffer;
      node.start(0);
      unlocked = true;
    }

    isPlaying = !isPlaying;

    if (isPlaying) { // start playing
        current16thNote = 0;
        nextNoteTime = audioContext.currentTime;
		//console.log(nextNoteTime);
		nextNoteTime += 0.1; //NM added to fix problem with first note being clipped
		
        timerWorker.postMessage("start");
		
		//NM added
		noteCount = 0;
		//
        return "stop";
    } else {
        timerWorker.postMessage("stop");
        return "play";
    }
}

function resetCanvas (e) {
    // resize the canvas - but remember - this clears the canvas too.
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    //make sure we scroll to the top left.
    window.scrollTo(0,0); 
}

function draw() {
    var currentNote = last16thNoteDrawn;
    var currentTime = audioContext.currentTime;

    while (notesInQueue.length && notesInQueue[0].time < currentTime) {
        currentNote = notesInQueue[0].note;
        notesInQueue.splice(0,1);   // remove note from queue
    }

    // We only need to draw if the note has moved.
    if (last16thNoteDrawn != currentNote) {
        var x = Math.floor( canvas.width / 18 );
        canvasContext.clearRect(0,0,canvas.width, canvas.height); 
        for (var i=0; i<16; i++) {
            canvasContext.fillStyle = ( currentNote == i ) ? 
                ((currentNote%4 === 0)?"red":"blue") : "black";
				
            canvasContext.fillRect( x * (i+1), x, x/2, x/2 );
        }
        last16thNoteDrawn = currentNote;

//NM added here
		//change key displayed on first beat only
		if(currentNote === 0){
			if(sequence === 1){ //cyc 4ths
				noteDisplay.innerHTML = notesCyc4[noteCount];				
			} else if (sequence === 2){ //random
				noteDisplay.innerHTML = notesRand[noteCount];
			} else { //none
				noteDisplay.innerHTML = "";
			}
			
			noteCount++;
			if(noteCount >= notesCyc4.length) { //all sequences same length
				noteCount = 0;
				shuffleArray(notesRand);
				//console.log(notesRand);
			}	
		}
//		
    }

    // set up to draw again
    requestAnimFrame(draw);
	
}

//NM added - off stackexchange, a random shuffle in place function
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
//NM added
function mute() { //mute event  - zeros out the gain node, or sets to full depending on state
    isMuted = !isMuted;

    if (isMuted) {
 		gainNode.gain.value = 0;
		return "unmute";
    } else {
		gainNode.gain.value = 1;
		return "mute";
    }
}

function updateTempo(){
	tempo = event.target.value; 
	document.getElementById('showTempo').value = tempo;
}
function updateTempoSlider(){
	tempo = event.target.value; 
	document.getElementById('tempo').value = tempo;
}

function init(){
    var container = document.createElement( 'div' );

    container.className = "container";
    canvas = document.createElement( 'canvas' );
    canvasContext = canvas.getContext( '2d' );
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight / 3; 
    document.body.appendChild( container );
    container.appendChild(canvas);    
    canvasContext.strokeStyle = "#ffffff";
    canvasContext.lineWidth = 2;

//NM new
    noteDisplay = document.createElement( 'div' );
    noteDisplay.className = "notedisplay";
    document.body.appendChild( noteDisplay );

	noteDisplay.innerHTML = "";
	
	shuffleArray(notesRand);
	
	var element1 = document.getElementById('resSelect');
	element1.selectedIndex  = 0;
	element1 = document.getElementById('seqSelect');
	element1.selectedIndex  = 0;
	element1 = document.getElementById('tempo');	
	element1.value = tempo;
	element1 = document.getElementById('showTempo');
	element1.value = tempo;
//

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    audioContext = new AudioContext();

    // if we wanted to load audio files, etc., this is where we should do it.

//NM added mute(vol) control
	// Create a gain node.
	gainNode = audioContext.createGain();
	gainNode.gain.value = 1; //default to full

    window.onorientationchange = resetCanvas;
    window.onresize = resetCanvas;

    requestAnimFrame(draw);    // start the drawing loop.

    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );

