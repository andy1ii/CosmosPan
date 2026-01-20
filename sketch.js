// --- CONFIGURATION ---
let carouselScroll = 0;
let opticalOffset = 15;
let delayStart = 20; 
let isDarkMode = false;
let itemPadding = 20; 

// --- TEXT & FONTS ---
let fontSans, fontSerif;
let leftText = "From Red";
let rightText = "to Rosso Ancora";

// Image Management
let imgs = [];
let nodes = [];
let totalCarouselWidth = 0;
let lastSizeCategory = -1; 

// Camera & Interaction
let camDist = 800;

// Video/Export State
let isRecording = false;
let recorder;
let recordingFrameCount = 0;

// --- ANIMATION TIMING ---
const BLANK_DURATION = 10;
const TEXT_INTRO_DURATION = 3; // CHANGED: Was 20. Starts moving much sooner.
const INTRO_DELAY = 0; 

// CLOSING PHASE TIMING
const CLOSE_DELAY = 5;         // CHANGED: Was 30. Squeeze happens instantly.
const CLOSE_DURATION = 90;  
const END_HOLD = 60;        

// DYNAMIC TIMING VARIABLES
let waveStartFrame = 0;
let moveDuration = 0;
let totalSequenceLen = 0;

// --- TUNING KNOBS ---
const INTRO_ZONE = 150;        
const STATIC_SHRINK_ZONE = 20;   
const MOVING_SHRINK_ZONE = 150;  

// DOM Elements
let uploadInput, exportBtn, recordBtn, resetBtn, themeBtn;
let leftTextInput, rightTextInput;

function preload() {
  fontSans = loadFont('resources/ItemsTextTrial-Book.otf');
  fontSerif = loadFont('resources/ItemsTextTrial-Book.otf');
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
  textureMode(NORMAL);

  if (typeof CCapture === 'undefined') {
      loadScript("https://unpkg.com/ccapture.js@1.1.0/build/CCapture.all.min.js", () => {
          console.log("CCapture loaded dynamically.");
      });
  }
  setupUI();
  rebuildCarousel();
}

function draw() {
  background(isDarkMode ? 0 : '#EBECEA');
  camera(0, 0, camDist, 0, 0, 0, 0, 1, 0);

  // --- 1. CALCULATE TEXT METRICS ---
  push();
  textSize(40);
  textFont(fontSerif); let wl = textWidth(leftText);
  textFont(fontSans);  let wr = textWidth(rightText);
  let spaceW = textWidth(" "); 
  pop();

  // STATE 0: EMPTY
  if (nodes.length === 0) {
      let totalW = wl + spaceW + wr;
      let startX = -totalW / 2;
      drawTextSimple(startX, wl, spaceW, wr);
      return;
  }

  // STATE 1: CONTENT LOADED
  let contentHalfWidth = totalCarouselWidth / 2;
  let textGap = itemPadding; 

  let leftTextWorldX = -contentHalfWidth - textGap - (wl / 2);
  let rightTextWorldX = contentHalfWidth + textGap + (wr / 2);

  moveDuration = (nodes.length * 10) + 60; 
  waveStartFrame = BLANK_DURATION + TEXT_INTRO_DURATION + INTRO_DELAY;
  let SEQ_DURATION = waveStartFrame + moveDuration; 
  totalSequenceLen = SEQ_DURATION + CLOSE_DELAY + CLOSE_DURATION + END_HOLD;

  if (!isRecording) {
      // MODE A: PREVIEW
      let mouseLimit = -leftTextWorldX + 100; 
      let endLimit = -rightTextWorldX - 100;  
      let targetScroll = map(mouseX, 0, width, mouseLimit, endLimit);
      carouselScroll = lerp(carouselScroll, targetScroll, 0.1);
      drawScenePreview(leftTextWorldX, rightTextWorldX);
  } else {
      // MODE B: RECORDING
      let t = 0;
      if (recordingFrameCount > delayStart) {
          let activeFrame = recordingFrameCount - delayStart;
          if (activeFrame <= totalSequenceLen) {
              t = activeFrame;
          } else {
              stopVideoExport();
              t = totalSequenceLen;
          }
      }

      // 1. Camera Panning
      let state = getAnimState(t, leftTextWorldX, rightTextWorldX, moveDuration);
      carouselScroll = state.scrollVal;

      // 2. Closing State
      let closeStart = SEQ_DURATION + CLOSE_DELAY;
      let closingProgress = 0;
      if (t > closeStart) {
          let p = map(t, closeStart, closeStart + CLOSE_DURATION, 0, 1, true);
          closingProgress = easeInOutQuint(p);
      }

      let combinedW = wl + spaceW + wr;
      let finalLeftTextPos = rightTextWorldX - (combinedW / 2) + (wl / 2);
      let finalRightTextPos = rightTextWorldX + (combinedW / 2) - (wr / 2);
      let currentShift = lerp(0, finalLeftTextPos - leftTextWorldX, closingProgress);
      let currentRtX = lerp(rightTextWorldX, finalRightTextPos, closingProgress);
      
      // --- BOUNDARIES ---
      let wallX = currentRtX - (wr / 2); // Outro Wall
      
      // --- SAFE INTRO WAVE ---
      let firstImgLeftEdge = nodes[0].xOff - (nodes[0].w / 2);
      let distToFirstImg = firstImgLeftEdge - leftTextWorldX;
      let safeWaveOffset = min(200, distToFirstImg - 50);
      let introWaveX = -carouselScroll + safeWaveOffset; 

      // --- DRAW IMAGES ---
      for (let i = 0; i < nodes.length; i++) {
          let n = nodes[i];
          push();
          let currentImgWorldX = n.xOff + currentShift; 
          translate(currentImgWorldX + carouselScroll, 0, 0);
           
          // 1. Intro Scale
          let introScale = 0;
          if (t >= waveStartFrame) {
              let imgLeftEdge = currentImgWorldX - (n.w / 2);
              let distFromWave = introWaveX - imgLeftEdge;
              if (distFromWave > 0) {
                  let p = map(distFromWave, 0, INTRO_ZONE, 0, 1, true);
                  introScale = easeInOutQuint(p);
              }
          }
          
          // 2. Outro Scale
          let outroScale = 1;
          if (closingProgress > 0) {
              let imgRightEdge = currentImgWorldX + (n.w / 2);
              let distToWall = wallX - imgRightEdge;
              
              if (distToWall <= 0) {
                  outroScale = 0; 
              } else {
                  let isLeadingImage = (i === nodes.length - 1);
                  let myShrinkZone = isLeadingImage ? STATIC_SHRINK_ZONE : MOVING_SHRINK_ZONE;
                  outroScale = map(distToWall, 0, myShrinkZone, 0, 1, true);
                  outroScale = easeInOutQuint(outroScale); 
              }
          }
          
          let finalScale = introScale * outroScale;

          if (finalScale > 0.001) {
              scale(finalScale);
              texture(n.img);
              plane(n.w, n.h);
          }
          pop();
      }

      // --- DRAW TEXT ---
      push();
      translate(0, 0, 2); 
      fill(isDarkMode ? 255 : 0);
      textSize(40); noStroke(); textFont(fontSans); textAlign(CENTER, CENTER);
      // CHANGED: Start 30 frames *before* the sequence ends, overlapping the movement.
      drawSentenceInstantly(rightText, t, SEQ_DURATION - 30, 4, currentRtX + carouselScroll);
      pop();

      // Left Text
      push();
      translate(0, 0, 2); 
      fill(isDarkMode ? 255 : 0);
      textSize(40); noStroke(); textFont(fontSerif); textAlign(CENTER, CENTER);
      drawSentenceInstantly(leftText, t, BLANK_DURATION, 5, (leftTextWorldX + currentShift) + carouselScroll); 
      pop();

      recordingFrameCount++;
      if (recorder) recorder.capture(document.querySelector('canvas'));
  }
}

// --- HELPER FUNCTIONS ---

function drawTextSimple(startX, wl, spaceW, wr) {
    push();
    fill(isDarkMode ? 255 : 0);
    textSize(40); noStroke(); textFont(fontSerif); textAlign(CENTER, CENTER);
    text(leftText, startX + (wl / 2), 0);
    pop();
    push();
    fill(isDarkMode ? 255 : 0);
    textSize(40); noStroke(); textFont(fontSans); textAlign(CENTER, CENTER);
    text(rightText, startX + wl + spaceW + (wr / 2), 0);
    pop();
}

function drawScenePreview(lx, rx) {
     for (let i = 0; i < nodes.length; i++) {
         let n = nodes[i];
         push();
         translate(n.xOff + carouselScroll, 0, 0);
         texture(n.img);
         plane(n.w, n.h);
         pop();
     }
     push(); fill(isDarkMode ? 255 : 0); textSize(40); noStroke(); 
     textFont(fontSerif); textAlign(CENTER, CENTER);
     text(leftText, lx + carouselScroll, 0);
     pop();
     push(); fill(isDarkMode ? 255 : 0); textSize(40); noStroke();
     textFont(fontSans); textAlign(CENTER, CENTER);
     text(rightText, rx + carouselScroll, 0);
     pop();
}

function getAnimState(t, leftTextX, rightTextX, moveLen) {
    let startMove = BLANK_DURATION + TEXT_INTRO_DURATION + INTRO_DELAY;
    let endMove = startMove + moveLen;

    if (t < startMove) return { scrollVal: -leftTextX };
    
    if (t >= startMove && t <= endMove) {
        let p = map(t, startMove, endMove, 0, 1, true);
        let easedP = easeInOutQuint(p);
        let currentX = map(easedP, 0, 1, leftTextX, rightTextX);
        return { scrollVal: -currentX };
    }
    // Once movement finishes, camera locks to Right Text
    return { scrollVal: -rightTextX };
}

function drawSentenceInstantly(txt, t, startFrame, interval, centerX) {
    let words = txt.split(" ");
    let fullW = textWidth(txt);
    let xCursor = centerX - (fullW / 2);
      
    for (let i = 0; i < words.length; i++) {
        let word = words[i];
        let wordW = textWidth(word);
        let spaceW = textWidth(" ");
        let wordActivationTime = startFrame + (i * interval);
        if (t >= wordActivationTime) text(word, xCursor + (wordW / 2), 0);
        xCursor += wordW + spaceW;
    }
}

function easeInOutQuint(x) {
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

// --- IMAGE PRE-PROCESSING ---

function prepareImage(img) {
  let currentCategory;
  do {
      currentCategory = floor(random(0, 3));
  } while (currentCategory === lastSizeCategory);

  lastSizeCategory = currentCategory;

  let displayH;
  if (currentCategory === 0) {
      displayH = random(150, 250); 
  } else if (currentCategory === 1) {
      displayH = random(300, 400); 
  } else {
      displayH = random(450, 600); 
  }

  const MIN_H = 150;
  const MAX_H = 600;
  const MAX_ROUND_FACTOR = 0.08; 
  const MIN_ROUND_FACTOR = 0.02; 
    
  let roundnessFactor = map(displayH, MIN_H, MAX_H, MAX_ROUND_FACTOR, MIN_ROUND_FACTOR, true);
  let minDimension = min(img.width, img.height);
  let requiredSourceRadius = minDimension * roundnessFactor;
    
  let ratio = img.width / img.height;
  let displayW = displayH * ratio;
    
  let roundedImg = makeRounded(img, requiredSourceRadius);
  roundedImg.finalH = displayH;
  roundedImg.finalW = displayW;
  return roundedImg;
}

function makeRounded(img, radius) {
  let mask = createGraphics(img.width, img.height);
  mask.clear(); mask.fill(255); mask.noStroke();
  let r = min(radius, img.width/2, img.height/2);
  mask.rect(0, 0, img.width, img.height, r);
  let newImg = img.get(); newImg.mask(mask); mask.remove();
  return newImg;
}

// --- CAROUSEL BUILDER ---

function rebuildCarousel() {
  nodes = [];
  if (imgs.length === 0) { totalCarouselWidth = 0; return; }
    
  let currentTotalW = 0;
  let sizingData = imgs.map(img => {
      if (!img.finalH) img = prepareImage(img);
      currentTotalW += img.finalW;
      return { img, w: img.finalW, h: img.finalH };
  });

  if (sizingData.length > 0) currentTotalW += (sizingData.length - 1) * itemPadding;
  totalCarouselWidth = currentTotalW;
  let startX = -totalCarouselWidth / 2;
    
  nodes = sizingData.map(d => {
      let node = { img: d.img, xOff: startX + (d.w / 2), w: d.w, h: d.h };
      startX += d.w + itemPadding;
      return node;
  });
}

function handleFileUpload(file) {
  if (file.type === 'image') {
    loadImage(file.data, (loadedImg) => {
      loadedImg.filename = file.name;
      imgs.push(loadedImg);
      imgs.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
      rebuildCarousel();
    });
  }
}

// --- UI & BOILERPLATE ---

function handleReset() { imgs = []; nodes = []; carouselScroll = 0; totalCarouselWidth = 0; lastSizeCategory = -1; }
function handleExport() { save("layout_export.png"); }

function startVideoExport() {
    if (nodes.length === 0) return;
    carouselScroll = 0; recordingFrameCount = 0; isRecording = true;
    recorder = new CCapture({ format: 'webm', framerate: 30 });
    recorder.start();
    recordBtn.html("Recording...");
    recordBtn.style('color', 'red');
}

function stopVideoExport() {
    if(recorder) {
        recorder.stop(); recorder.save(); isRecording = false;
        recordBtn.html("Save Video"); updateThemeStyling();
    }
}

function handleVideoToggle() { if (isRecording) stopVideoExport(); else startVideoExport(); }
function toggleTheme() { isDarkMode = !isDarkMode; updateThemeStyling(); }

function setupUI() {
  leftTextInput = createInput(leftText);
  leftTextInput.input(() => { leftText = leftTextInput.value(); });
  rightTextInput = createInput(rightText);
  rightTextInput.input(() => { rightText = rightTextInput.value(); });

  uploadInput = createFileInput(handleFileUpload, true);
  uploadInput.elt.onclick = () => { handleReset(); };
    
  exportBtn = createButton('Save Image'); exportBtn.mousePressed(handleExport);
  recordBtn = createButton('Save Video'); recordBtn.mousePressed(handleVideoToggle);
  resetBtn = createButton('Reset'); resetBtn.mousePressed(handleReset);
  themeBtn = createButton('Light'); themeBtn.mousePressed(toggleTheme);
    
  let els = [uploadInput, exportBtn, recordBtn, resetBtn, themeBtn, leftTextInput, rightTextInput];
  els.forEach(styleUIElement);
  updateThemeStyling(); positionUI();
}

function updateThemeStyling() {
    let txtCol = isDarkMode ? '#fff' : '#000';
    let els = [uploadInput, exportBtn, recordBtn, resetBtn, themeBtn, leftTextInput, rightTextInput];
    els.forEach(e => {
      e.style('color', txtCol);
      e.style('border', isDarkMode ? '1px solid #555' : '1px solid #aaa');
    });
    themeBtn.html(isDarkMode ? "Light" : "Dark");
    if(isRecording) recordBtn.style('color', 'red');
}

function positionUI() {
  let yPos = height - 40;
  leftTextInput.position(20, yPos); rightTextInput.position(180, yPos);
  let rM = width - 20;
  themeBtn.position(rM - 60, yPos); resetBtn.position(rM - 120, yPos);
  recordBtn.position(rM - 210, yPos); exportBtn.position(rM - 300, yPos);
  uploadInput.position(rM - 500, yPos);
}

function styleUIElement(elt) {
  elt.style('background', 'transparent'); elt.style('padding', '4px');
  elt.style('font-family', 'sans-serif'); 
}

function loadScript(url, callback){
    var script = document.createElement("script");
    script.onload = callback; script.src = url;
    document.getElementsByTagName("head")[0].appendChild(script);
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); positionUI(); }