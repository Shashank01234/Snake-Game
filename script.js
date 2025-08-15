// ====== Tiny DOM helpers ======
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ====== Constants ======
const DIFFICULTY_SPEEDS = { Easy:150, Medium:110, Hard:90, Harder:70, Impossible:50 };
const GRID = 20, WIDTH = 960, HEIGHT = 600;
const COLS = Math.floor(WIDTH / GRID), ROWS = Math.floor(HEIGHT / GRID);

// ====== LocalStorage (multi-user) ======
function loadUsers(){
  try { return JSON.parse(localStorage.getItem("snakex_users")||"{}"); }
  catch { return {}; }
}
function saveUsers(){ localStorage.setItem("snakex_users", JSON.stringify(users)); }
function ensureUser(name){
  if(!users.byName[name]) users.byName[name] = { stats:{} };
  ["Easy","Medium","Hard","Harder","Impossible"].forEach(d=>{
    if(!users.byName[name].stats[d]) users.byName[name].stats[d] = { games:0, high:0, total:0, history:[] };
  });
}
let users = loadUsers();
if(!users.byName){ users = { current: null, byName:{} }; }
if(!users.current){
  users.current = "Player1";
  users.byName["Player1"] = { stats:{} };
}
ensureUser(users.current);
saveUsers();

function setCurrentUser(name){
  users.current = name; ensureUser(name); saveUsers();
  hydrateUserUI();
}

// ====== Populate/Sync Intro Auth UI ======
const userSelect = $("#userSelect");
const newUserName = $("#newUserName");
const authHint = $("#authHint");

function hydrateUserDropdown(){
  userSelect.innerHTML = Object.keys(users.byName)
    .sort((a,b)=>a.localeCompare(b))
    .map(n=>`<option value="${n}" ${n===users.current?'selected':''}>${n}</option>`).join("");
}
function hydrateUserUI(){
  hydrateUserDropdown();
  $("#hudUser").textContent   = `Player: ${users.current}`;
  $("#statsUser").textContent = users.current;
}
hydrateUserUI();

// ====== Screens ======
function showScreen(id){ $$(".screen").forEach(s=>s.classList.remove("active")); $(id).classList.add("active"); }

// ====== Intro animated snakes ======
const introCanvas = $("#introCanvas");
const ictx = introCanvas.getContext("2d");
let introSnakes = [];
let introRunning = true;
function spawnIntroSnakes(n=7){
  introSnakes = [];
  for(let i=0;i<n;i++){
    const len = 10 + Math.floor(Math.random()*20);
    const path = [];
    const startX = Math.floor(Math.random()*COLS)*GRID;
    const startY = Math.floor(Math.random()*ROWS)*GRID;
    for(let j=0;j<len;j++) path.push({x:startX - j*GRID, y:startY});
    const vx = (Math.random()<0.5?-1:1)*GRID;
    introSnakes.push({path, vx, hue: 110 + Math.random()*40, t: Math.random()*1000});
  }
}
function drawIntro(){
  if(!introRunning) return;
  ictx.clearRect(0,0,WIDTH,HEIGHT);
  ictx.fillStyle = "#020409"; ictx.fillRect(0,0,WIDTH,HEIGHT);
  introSnakes.forEach(s=>{
    s.t += 1;
    if(s.t % 12 === 0){
      const head = { x:(s.path[0].x + s.vx + WIDTH)%WIDTH, y:s.path[0].y };
      s.path.unshift(head); s.path.pop();
    }
    for(let i=0;i<s.path.length;i++){
      const p = s.path[i];
      ictx.fillStyle  = `hsla(${s.hue}, 100%, ${60 - i*1.5}%, ${0.7 - i*0.02})`;
      ictx.shadowBlur = 18 - i;
      ictx.shadowColor= `hsl(${s.hue}, 100%, 60%)`;
      ictx.fillRect(p.x, p.y, GRID, GRID);
    }
  });
  requestAnimationFrame(drawIntro);
}
function startIntroAnimation(){
  introRunning = true;
  spawnIntroSnakes();
  drawIntro();
}
function stopIntroAnimation(){
  introRunning = false;
}
startIntroAnimation();

// ====== Game State ======
const canvas = $("#gameCanvas");
const ctx = canvas.getContext("2d");

let running=false, paused=false, tickMs=110, score=0;
let snake=[], direction={x:1,y:0}, nextDirection={x:1,y:0};
let lastTick=0, tweenTime=0;
let currentDifficulty="Medium";

let withObstacles=false, selectedObstacleType="random", enableFakeFood=false;
let staticWalls=[], movingBars=[], spinners=[], portals=[], otherObstacles=[];
let food=null, fakeFood=null;
let brighterFood = null;
let brighterFoodTimeout = null;

// ====== Helpers ======
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const manhattan = (a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const randomInt = (min,max)=>Math.floor(Math.random()*(max-min+1))+min;

function randomEmptyCell(){
  let attempts = 0;
  while(true){
    const x = Math.floor(Math.random()*COLS);
    const y = Math.floor(Math.random()*ROWS);
    const occupied = snake.some(s=>s.x===x && s.y===y) ||
      staticWalls.some(o=>o.x===x && o.y===y) ||
      movingBars.some(b=> occupiesMoving(b,x,y)) ||
      spinners.some(sp=> occupiesSpinner(sp,x,y)) ||
      otherObstacles.some(o=>o.x===x && o.y===y);
    if(!occupied) return {x,y};
    if(++attempts > 2000) return {x: Math.floor(COLS/2), y: Math.floor(ROWS/2)}; // fallback
  }
}

// ====== Moving + Spinner Occupy ======
function occupiesMoving(bar,x,y){
  for(let i=0;i<bar.len;i++){
    const cx = bar.axis==="h" ? bar.x + i : bar.x;
    const cy = bar.axis==="v" ? bar.y + i : bar.y;
    if(cx===x && cy===y) return true;
  }
  return false;
}
function stepMovingBars(){
  movingBars.forEach(b=>{
    b.counter++;
    if(b.counter % b.interval === 0){
      if(b.axis==="h"){
        b.x += b.dir;
        if(b.x <= b.min || b.x + b.len - 1 >= b.max) b.dir *= -1;
      }else{
        b.y += b.dir;
        if(b.y <= b.min || b.y + b.len - 1 >= b.max) b.dir *= -1;
      }
    }
  });
}
function occupiesSpinner(sp,x,y){
  if(x===sp.cx && y===sp.cy) return true;
  if(sp.state===0){
    for(let i=1;i<=sp.len;i++) if((x===sp.cx-i || x===sp.cx+i) && y===sp.cy) return true;
  }else{
    for(let i=1;i<=sp.len;i++) if((y===sp.cy-i || y===sp.cy+i) && x===sp.cx) return true;
  }
  return false;
}
function stepSpinners(){
  spinners.forEach(sp=>{
    sp.counter++;
    if(sp.counter % sp.interval === 0) sp.state = (sp.state+1)%2;
  });
}

// ====== Obstacle Generation ======
function generateObstacleType(type){
  // Increase count for staticWalls
  const count = type === "staticWalls" ? randomInt(10, 18) : randomInt(5, 10);
  staticWalls = []; movingBars = []; spinners = []; portals = []; otherObstacles = []; enableFakeFood = false;

  switch(type){
    case "staticWalls":
      for(let i=0;i<count;i++){
        const base = randomEmptyCell();
        const shapeType = randomInt(1, 5); // 1: long line, 2: big L, 3: big T, 4: big block, 5: cross
        switch(shapeType){
          case 1: // Long line (horizontal or vertical)
            if(Math.random()<0.5){
              const len = randomInt(6, 12);
              for(let dx=0;dx<len;dx++){
                const x = clamp(base.x+dx, 1, COLS-2);
                staticWalls.push({x, y:base.y});
              }
            }else{
              const len = randomInt(6, 12);
              for(let dy=0;dy<len;dy++){
                const y = clamp(base.y+dy, 1, ROWS-2);
                staticWalls.push({x:base.x, y});
              }
            }
            break;
          case 2: // Big L-shape
            const lenL = randomInt(4, 8);
            for(let dx=0;dx<lenL;dx++){
              const x = clamp(base.x+dx, 1, COLS-2);
              staticWalls.push({x, y:base.y});
            }
            for(let dy=1;dy<lenL;dy++){
              const y = clamp(base.y+dy, 1, ROWS-2);
              staticWalls.push({x:base.x, y});
            }
            break;
          case 3: // Big T-shape
            const lenT = randomInt(4, 8);
            for(let dx=-Math.floor(lenT/2);dx<=Math.floor(lenT/2);dx++){
              const x = clamp(base.x+dx, 1, COLS-2);
              staticWalls.push({x, y:base.y});
            }
            for(let dy=1;dy<=lenT-2;dy++){
              const y = clamp(base.y+dy, 1, ROWS-2);
              staticWalls.push({x:base.x, y});
            }
            break;
          case 4: // Big block (rectangle)
            const w = randomInt(3, 6), h = randomInt(3, 6);
            for(let dx=0;dx<w;dx++){
              for(let dy=0;dy<h;dy++){
                const x = clamp(base.x+dx, 1, COLS-2);
                const y = clamp(base.y+dy, 1, ROWS-2);
                staticWalls.push({x, y});
              }
            }
            break;
          case 5: // Cross shape
            const lenC = randomInt(4, 8);
            for(let d=0;d<lenC;d++){
              staticWalls.push({x:clamp(base.x+d,1,COLS-2), y:base.y});
              staticWalls.push({x:base.x, y:clamp(base.y+d,1,ROWS-2)});
            }
            break;
        }
      }
      break;

    case "movingBars":
      for(let i=0;i<count;i++){
        const axis = Math.random()<0.5 ? "h" : "v";
        const len = randomInt(5, 10); // Increased bar size
        movingBars.push({
          x: axis === "h" ? randomInt(0, COLS - len) : randomInt(0, COLS - 1),
          y: axis === "v" ? randomInt(0, ROWS - len) : randomInt(0, ROWS - 1),
          len,
          axis,
          dir: Math.random()<0.5 ? 1 : -1,
          min: 0, // Can move to the very edge
          max: axis === "h" ? COLS - 1 : ROWS - 1,
          interval: randomInt(2, 4),
          counter: 0
        });
      }
      break;

    case "rotatingGates":
      for(let i=0;i<count;i++){
        spinners.push({
          cx:randomInt(4,COLS-5), cy:randomInt(4,ROWS-5),
          len:randomInt(1,3), state:Math.random()<0.5?0:1, interval:randomInt(4,7), counter:0
        });
      }
      break;

    case "fakeFoodTraps":
      // Place a few fake-food triggers (otherObstacles) but keep fakeFood logic active.
      enableFakeFood = true;
      for(let i=0;i<count;i++) otherObstacles.push(randomEmptyCell());
      break;

    case "diagonalWalls":
      for(let i=0;i<count;i++){
        let base = randomEmptyCell();
        for(let j=0;j<4;j++){
          const x = clamp(base.x + j, 1, COLS-2);
          const y = clamp(base.y + j, 1, ROWS-2);
          staticWalls.push({x,y});
        }
      }
      break;

    case "portalPairs":
      portals = [];
      staticWalls = [];
      const closedCount = randomInt(2, 3); // Fewer but bigger closed structures
      let closedRects = [];
      let allPortals = [];
      // Generate closed structures and place a portal in the middle of each
      for(let i=0; i<closedCount; i++){
        let w = randomInt(10, 16), h = randomInt(10, 16);
        let x0, y0, tries = 0, overlap;
        do {
          x0 = randomInt(2, COLS-w-2);
          y0 = randomInt(2, ROWS-h-2);
          overlap = closedRects.some(rect =>
            x0 < rect.x+rect.w && x0+w > rect.x &&
            y0 < rect.y+rect.h && y0+h > rect.y
          );
          tries++;
        } while(overlap && tries < 100);
        if(tries >= 100) continue;

        closedRects.push({x:x0, y:y0, w, h});

        // Build closed rectangle walls
        for(let dx=0; dx<w; dx++){
          staticWalls.push({x: x0+dx, y: y0});
          staticWalls.push({x: x0+dx, y: y0+h-1});
        }
        for(let dy=1; dy<h-1; dy++){
          staticWalls.push({x: x0, y: y0+dy});
          staticWalls.push({x: x0+w-1, y: y0+dy});
        }

        // Place portal in the middle of the closed structure
        const midX = Math.floor(x0 + w/2);
        const midY = Math.floor(y0 + h/2);
        let blockMid = [
          {x: midX, y: midY},
          {x: midX+1 < x0+w-1 ? midX+1 : midX, y: midY},
          {x: midX, y: midY+1 < y0+h-1 ? midY+1 : midY},
          {x: midX+1 < x0+w-1 ? midX+1 : midX, y: midY+1 < y0+h-1 ? midY+1 : midY}
        ];
        allPortals.push(...blockMid);
        portals.push(...blockMid);
      }
      // Create 2 portals outside all closed structures
      for(let i=0; i<2; i++){
        let outside, tries = 0;
        do {
          outside = randomEmptyCell();
          tries++;
        } while (
          closedRects.some(rect =>
            outside.x >= rect.x && outside.x < rect.x+rect.w &&
            outside.y >= rect.y && outside.y < rect.y+rect.h
          ) && tries < 100
        );
        let blockOutside = [
          {x: outside.x, y: outside.y},
          {x: outside.x+1 < COLS ? outside.x+1 : outside.x, y: outside.y},
          {x: outside.x, y: outside.y+1 < ROWS ? outside.y+1 : outside.y},
          {x: outside.x+1 < COLS ? outside.x+1 : outside.x, y: outside.y+1 < ROWS ? outside.y+1 : outside.y}
        ];
        allPortals.push(...blockOutside);
        portals.push(...blockOutside);
      }
      // Every portal connects to all other portals (including itself, but we'll randomize exit)
      portals.portalPairs = [{from: allPortals, to: allPortals}];
      break;

    case "spiralWalls":
      // small random spiral clusters
      for(let s=0;s<count;s++){
        let b = randomEmptyCell();
        const size = 3 + Math.floor(Math.random()*3);
        for(let layer=0; layer<size; layer++){
          for(let x=b.x+layer; x<b.x+size-layer; x++){
            staticWalls.push({x: clamp(b.y+layer,1,ROWS-2), y: x});
          }
          for(let y=b.y+layer; y<b.y+size-layer; y++){
            staticWalls.push({x: clamp(b.x+size-layer-1,1,COLS-2), y});
          }
        }
      }
      break;

    case "clusterBlocks":
      for(let i=0;i<count;i++){
        let c = randomEmptyCell();
        staticWalls.push(c);
        if(c.x+1 < COLS-1) staticWalls.push({x:c.x+1,y:c.y});
        if(c.y+1 < ROWS-1) staticWalls.push({x:c.x,y:c.y+1});
        if(c.x+1 < COLS-1 && c.y+1 < ROWS-1) staticWalls.push({x:c.x+1,y:c.y+1});
      }
      break;

    case "mazePattern":
      // loose maze-like pattern
      for(let i=2;i<COLS-2;i+=2){
        for(let j=2;j<ROWS-2;j+=2){
          if(Math.random()<0.22) staticWalls.push({x:i,y:j});
          if(Math.random()<0.05 && i+1<COLS-2) staticWalls.push({x:i+1,y:j});
        }
      }
      break;

    default:
      // fallback: some static walls
      for(let i=0;i<count;i++) staticWalls.push(randomEmptyCell());
      break;
  }

  // De-duplicate staticWalls by coordinates
  const seen = new Set();
  staticWalls = staticWalls.filter(o=>{
    const k = `${o.x},${o.y}`;
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ====== Food ======
function spawnFood(){
  food = randomEmptyCell();
  if(enableFakeFood && Math.random()<0.18) fakeFood = randomEmptyCell();
  else fakeFood = null;
}

// ====== Game Flow ======
function startGame(){
  stopIntroAnimation();
  showScreen("#game");
  running=true; paused=false;

  currentDifficulty = $("#difficulty").value;
  tickMs = DIFFICULTY_SPEEDS[currentDifficulty];
  $("#hudDifficulty").textContent = currentDifficulty;
  $("#hudUser").textContent = `Player: ${users.current}`;

  withObstacles = $("#enableObstacles").checked;
  selectedObstacleType = $("#obstacleType").value;
  if(selectedObstacleType==="random") {
    let opts = Array.from($("#obstacleType").options).map(o=>o.value).filter(v=>v!=="random");
    selectedObstacleType = opts[Math.floor(Math.random()*opts.length)];
  }

  $("#hudMode").textContent = withObstacles ? `Obstacles: ${selectedObstacleType}` : "Obstacles: Off";

  score = 0; $("#hudScore").textContent = "0";

  // --- Ensure snake starts in empty cells ---
  if(withObstacles) generateObstacleType(selectedObstacleType);

  let startCells = [];
  let tries = 0;
  while (startCells.length < 3 && tries < 1000) {
    const start = randomEmptyCell();
    const dir = {x:1, y:0}; // default right
    const cells = [
      start,
      {x: start.x-1, y: start.y},
      {x: start.x-2, y: start.y}
    ];
    // Check all cells are empty
    if (cells.every(c =>
      c.x >= 0 && c.x < COLS &&
      c.y >= 0 && c.y < ROWS &&
      !staticWalls.some(o=>o.x===c.x && o.y===c.y) &&
      !movingBars.some(b=> occupiesMoving(b,c.x,c.y)) &&
      !spinners.some(sp=> occupiesSpinner(sp,c.x,c.y)) &&
      !otherObstacles.some(o=>o.x===c.x && o.y===c.y)
    )) {
      startCells = cells;
      break;
    }
    tries++;
  }
  // Fallback to center if not found
  if (startCells.length < 3) {
    const startY = Math.floor(ROWS/2);
    startCells = [
      {x:6, y:startY},
      {x:5, y:startY},
      {x:4, y:startY}
    ];
  }
  snake = startCells;
  direction={x:1,y:0}; nextDirection={x:1,y:0};

  spawnFood();

  lastTick = performance.now(); tweenTime=0;
  requestAnimationFrame(gameLoop);
}

function endGame(){
  running=false; paused=false;
  ensureUser(users.current);
  const s = users.byName[users.current].stats[currentDifficulty];
  s.games += 1; s.total += score; if(score > s.high) s.high = score;
  s.history.push({score, date: new Date().toLocaleString()});
  if(s.history.length>200) s.history.shift();
  saveUsers();

  $("#finalScore").textContent = score;
  $("#gameOverModal").classList.remove("hidden");
}

function quitToHome(){
  $("#gameOverModal").classList.add("hidden");
  showScreen("#intro");
  startIntroAnimation();
  renderAggregateStats();
}

// ====== Loop ======
function gameLoop(now){
  if(!running) return;
  const delta = now - lastTick;
  if(!paused && delta >= tickMs){
    step(); lastTick = now; tweenTime = 0;
  }else{
    tweenTime = delta / tickMs;
  }
  render();
  requestAnimationFrame(gameLoop);
}

// ====== Step ======
function step(){
  if(withObstacles){
    if(movingBars.length) stepMovingBars();
    if(spinners.length) stepSpinners();
  }
  if(nextDirection.x !== -direction.x || nextDirection.y !== -direction.y) direction = {...nextDirection};
  
  let head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  // Wrap around logic for movingBars, rotatingGates, fakeFoodTraps, and portalPairs
  if(
    selectedObstacleType === "movingBars" ||
    selectedObstacleType === "rotatingGates" ||
    selectedObstacleType === "fakeFoodTraps" ||
    selectedObstacleType === "portalPairs" ||
    selectedObstacleType === "spiralWalls" ||
    selectedObstacleType === "clusterBlocks" ||
    selectedObstacleType === "mazePattern" || 
    selectedObstacleType === "diagonalWalls" ||
    selectedObstacleType === "staticWalls"
  ){
    if(head.x < 0) head.x = COLS - 1;
    if(head.x >= COLS) head.x = 0;
    if(head.y < 0) head.y = ROWS - 1;
    if(head.y >= ROWS) head.y = 0;
  }

  // Edge collision for other types
  if(
    selectedObstacleType !== "movingBars" &&
    selectedObstacleType !== "rotatingGates" &&
    selectedObstacleType !== "fakeFoodTraps" &&
    (head.x<0 || head.x>=COLS || head.y<0 || head.y>=ROWS)
  ) return endGame();
  if(snake.some((s,i)=>i!==0 && s.x===head.x && s.y===head.y)) return endGame();

  if(withObstacles){
    // Static walls
    if(staticWalls.some(o=>o.x===head.x && o.y===head.y)) {
      // Zigzag wall teleport logic
      if(selectedObstacleType === "zigZagWalls" && staticWalls.teleportBlocks){
        const tp = staticWalls.teleportBlocks.find(pair =>
          (pair.from.x === head.x && pair.from.y === head.y)
        );
        if(tp){
          // Teleport snake to the paired block and continue
          head.x = tp.to.x;
          head.y = tp.to.y;
          // Do NOT end the game, just continue
        } else {
          // Only end game if not a teleport block
          return endGame();
        }
      } else {
        return endGame();
      }
    }

    // Moving bars: check all snake segments for collision
    if(selectedObstacleType === "movingBars"){
      for(let i=0; i<snake.length; i++){
        if(movingBars.some(b=> occupiesMoving(b, snake[i].x, snake[i].y))) return endGame();
      }
      if(movingBars.some(b=> occupiesMoving(b, head.x, head.y))) return endGame();
    }else{
      if(movingBars.some(b=> occupiesMoving(b, head.x, head.y))) return endGame();
    }

    // Rotating gates: check all snake segments for collision
    if(selectedObstacleType === "rotatingGates"){
      for(let i=0; i<snake.length; i++){
        if(spinners.some(sp=> occupiesSpinner(sp, snake[i].x, snake[i].y))) return endGame();
      }
      if(spinners.some(sp=> occupiesSpinner(sp, head.x, head.y))) return endGame();
    }else{
      if(spinners.some(sp=> occupiesSpinner(sp, head.x, head.y))) return endGame();
    }

    // Fake food traps
    if(enableFakeFood && otherObstacles.some(o=>o.x===head.x && o.y===head.y)){
      staticWalls.push({x:head.x, y:head.y});
      return endGame();
    }

    // Portal pairs
    if(portals.length && portals.portalPairs){
      for(const pair of portals.portalPairs){
        for(const from of pair.from){
          if(head.x === from.x && head.y === from.y){
            // Randomize exit point in all portals except the one entered
            let possibleExits = pair.to.filter(p => !(p.x === head.x && p.y === head.y));
            if(possibleExits.length === 0) possibleExits = pair.to; // fallback
            const exit = possibleExits[Math.floor(Math.random()*possibleExits.length)];
            head.x = exit.x;
            head.y = exit.y;
            break;
          }
        }
      }
    }
  }

  snake.unshift(head);

  // Fake food reveal effect
  if(enableFakeFood && fakeFood){
    const dist = manhattan(head, fakeFood);
    if(dist <= 2){
      const horizontal = Math.random()<0.5;
      const cells = horizontal
        ? [{x:fakeFood.x-1,y:fakeFood.y},{x:fakeFood.x,y:fakeFood.y},{x:fakeFood.x+1,y:fakeFood.y}]
        : [{x:fakeFood.x,y:fakeFood.y-1},{x:fakeFood.x,y:fakeFood.y},{x:fakeFood.x,y:fakeFood.y+1}];
      cells.forEach(c=>{
        if(c.x>=0 && c.x<COLS && c.y>=0 && c.y<ROWS) staticWalls.push(c);
      });
      fakeFood=null;
    }
  }

  if(head.x===food.x && head.y===food.y){
    score += 1; $("#hudScore").textContent = String(score);
    spawnFood();
  }else{
    snake.pop();
  }
}

// ====== Render ======
function render(){
  ctx.fillStyle = "#020409"; ctx.fillRect(0,0,WIDTH,HEIGHT);

  // static walls
  if(staticWalls.length){
    ctx.shadowBlur=6; ctx.shadowColor="#48a0ff55";
    staticWalls.forEach(o=>{
      ctx.fillStyle="#354355";
      ctx.fillRect(o.x*GRID,o.y*GRID,GRID,GRID);
      ctx.strokeStyle="#5aa7ff33";
      ctx.lineWidth=1;
      ctx.strokeRect(o.x*GRID+2,o.y*GRID+2,GRID-4,GRID-4);
      ctx.shadowBlur=0;
    });
  }

  // moving bars
  if(movingBars.length){
    movingBars.forEach(b=>{
      ctx.fillStyle="#ffb703"; ctx.shadowBlur=10; ctx.shadowColor="#ffcc66";
      for(let i=0;i<b.len;i++){
        const x = (b.axis==="h"? b.x + i : b.x) * GRID;
        const y = (b.axis==="v"? b.y + i : b.y) * GRID;
        ctx.fillRect(x,y,GRID,GRID);
      }
      ctx.shadowBlur=0;
    });
  }

  // spinners/rotating gates
  if(spinners.length){
    spinners.forEach(sp=>{
      ctx.fillStyle="#ff4d6d"; ctx.shadowBlur=12; ctx.shadowColor="#ff4d6d";
      ctx.fillRect(sp.cx*GRID, sp.cy*GRID, GRID, GRID);
      if(sp.state===0){
        for(let i=1;i<=sp.len;i++){
          ctx.fillRect((sp.cx-i)*GRID, sp.cy*GRID, GRID, GRID);
          ctx.fillRect((sp.cx+i)*GRID, sp.cy*GRID, GRID, GRID);
        }
      }else{
        for(let i=1;i<=sp.len;i++){
          ctx.fillRect(sp.cx*GRID, (sp.cy-i)*GRID, GRID, GRID);
          ctx.fillRect(sp.cx*GRID, (sp.cy+i)*GRID, GRID, GRID);
        }
      }
      ctx.shadowBlur=0;
    });
  }

  // other obstacles (e.g., fakeFood triggers or portal markers)
  if(otherObstacles.length){
    ctx.fillStyle="#8fb3ff"; ctx.shadowBlur=8;
    otherObstacles.forEach(o=> ctx.fillRect(o.x*GRID, o.y*GRID, GRID, GRID));
    ctx.shadowBlur=0;
  }

  // portals (visual markers)
  if(portals.length){
    ctx.save();
    for(let i=0;i<portals.length;i++){
      const p = portals[i];
      ctx.strokeStyle = i%2 ? "#a0ffa0" : "#ffa0ff";
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x*GRID+3, p.y*GRID+3, GRID-6, GRID-6);
    }
    ctx.restore();
  }

  // food pulse
  if(food){
    const t = performance.now()/300;
    const pulse = 0.2*Math.sin(t) + 0.8;
    ctx.save();
    ctx.translate((food.x+0.5)*GRID, (food.y+0.5)*GRID);
    ctx.scale(pulse,pulse);
    ctx.shadowBlur=16; ctx.shadowColor="#ffffff"; ctx.fillStyle="#ffffff";
    ctx.fillRect(-GRID/2+3,-GRID/2+3,GRID-6,GRID-6);
    ctx.restore();
  }

  // fake food visual
  if(enableFakeFood && fakeFood){
    const t = performance.now()/300;
    const p2 = 0.2*Math.cos(t*1.3) + 0.8;
    ctx.save();
    ctx.translate((fakeFood.x+0.5)*GRID,(fakeFood.y+0.5)*GRID);
    ctx.scale(p2,p2);
    ctx.shadowBlur=18; ctx.shadowColor="#ff6b6b"; ctx.fillStyle="#ff6b6b";
    ctx.fillRect(-GRID/2+3,-GRID/2+3,GRID-6,GRID-6);
    ctx.restore();
  }

  // snake slither taper
  for(let i=snake.length-1;i>=0;i--){
    const cur = snake[i];
    const prev = snake[i+1] || cur;
    const ix = cur.x*GRID - (cur.x - prev.x)*GRID*(1 - tweenTime);
    const iy = cur.y*GRID - (cur.y - prev.y)*GRID*(1 - tweenTime);
    ctx.save();
    ctx.shadowBlur = Math.max(4, 14 - i*0.5);
    ctx.shadowColor = "#36ff88";
    ctx.fillStyle  = i===0 ? "#36ff88" : "#2de275";
    const size = GRID - Math.min(12, i);
    ctx.fillRect(ix + (GRID-size)/2, iy + (GRID-size)/2, size, size);
    ctx.restore();
  }
}

// ====== Controls ======
document.addEventListener("keydown",(e)=>{
  switch(e.key){
    case "ArrowUp": case "w": case "W":
      if(direction.y===0) nextDirection={x:0,y:-1}; break;
    case "ArrowDown": case "s": case "S":
      if(direction.y===0) nextDirection={x:0,y:1};  break;
    case "ArrowLeft": case "a": case "A":
      if(direction.x===0) nextDirection={x:-1,y:0}; break;
    case "ArrowRight": case "d": case "D":
      if(direction.x===0) nextDirection={x:1,y:0};  break;
    case " ": togglePause(); break;
  }
});
function togglePause(){
  if(!running) return;
  paused = !paused;
  $("#pauseBtn").textContent = paused ? "Resume" : "Pause";
}

// ====== UI Wiring ======
$("#playBtn").addEventListener("click", startGame);
$("#statsBtn").addEventListener("click", ()=>{
  stopIntroAnimation();
  showScreen("#stats");
  renderAggregateStats();
  drawStatsChart();
});
$("#pauseBtn").addEventListener("click", togglePause);
$("#quitBtn").addEventListener("click", ()=> endGame());
$("#restartBtn").addEventListener("click", ()=>{
  $("#gameOverModal").classList.add("hidden");
  startGame();
});
$("#goHomeBtn").addEventListener("click", quitToHome);
$("#openStatsBtn").addEventListener("click", ()=>{
  $("#gameOverModal").classList.add("hidden");
  showScreen("#stats");
  renderAggregateStats();
  drawStatsChart();
});
$("#backHomeBtn").addEventListener("click", ()=>{
  showScreen("#intro");
  startIntroAnimation();
});

$("#statsDifficulty").addEventListener("change", drawStatsChart);
$("#enableObstacles").addEventListener("change",(e)=>{
  $("#obstacleSelectRow").classList.toggle("hidden", !e.target.checked);
});
$("#randomObstacleBtn").addEventListener("click", ()=>{
  $("#obstacleType").value = "random";
});

// Auth actions
$("#switchUserBtn").addEventListener("click", ()=>{
  const sel = userSelect.value;
  if(!sel) return;
  setCurrentUser(sel);
  authHint.textContent = `Switched to ${sel}`;
  authHint.style.color = "#9fb3c8";
});
$("#createUserBtn").addEventListener("click", ()=>{
  const raw = (newUserName.value||"").trim();
  const name = raw.replace(/[^\w\- ]/g,"").slice(0,24);
  if(!name){ authHint.textContent="Please enter a valid username."; authHint.style.color = "#ff6b6b"; return; }
  if(users.byName[name]){ authHint.textContent="Username already exists."; authHint.style.color = "#ffb703"; return; }
  users.byName[name] = { stats:{} }; ensureUser(name); setCurrentUser(name);
  newUserName.value = "";
  authHint.textContent = `Created user ${name}`; authHint.style.color = "#35ff88";
});
$("#deleteUserBtn").addEventListener("click", ()=>{
  const sel = userSelect.value;
  if(!sel) return;
  if(Object.keys(users.byName).length<=1){
    authHint.textContent = "At least one user must exist."; authHint.style.color = "#ffb703"; return;
  }
  const ok = confirm(`Delete user "${sel}" and all stats?`);
  if(!ok) return;
  delete users.byName[sel];
  if(users.current===sel){
    users.current = Object.keys(users.byName)[0];
  }
  saveUsers();
  hydrateUserUI();
  authHint.textContent = `Deleted ${sel}`; authHint.style.color = "#ff6b6b";
});

// ====== Stats Screen (per current user) ======
function getStatsFor(userName){
  ensureUser(userName);
  return users.byName[userName].stats;
}
function renderAggregateStats(){
  const stats = getStatsFor(users.current);
  const container = $("#aggregateStats");
  container.innerHTML = "";
  const card = (title, value)=>`
    <div class="card"><h4>${title}</h4><div class="value">${value}</div></div>`;
  // global aggregates
  const levels = Object.values(stats);
  const totalGames = levels.reduce((a,s)=>a+s.games,0);
  const best = Math.max(0, ...levels.map(s=>s.high));
  const avg = totalGames ? Math.round((levels.reduce((a,s)=>a+s.total,0)/totalGames)*10)/10 : 0;
  container.innerHTML += card("Total Games", totalGames);
  container.innerHTML += card("Best Ever", best);
  container.innerHTML += card("Average Score", avg);
  $("#statsUser").textContent = users.current;
  renderHistoryList($("#statsDifficulty").value);
}
function renderHistoryList(level){
  const stats = getStatsFor(users.current);
  const list = $("#historyList");
  const hist = stats[level].history.slice(-30).reverse();
  list.innerHTML = `<h3>Recent Games — ${users.current} · ${level}</h3>` + (hist.length ?
    hist.map(h=>`<div class="item"><span>${h.date}</span><span>Score: ${h.score}</span></div>`).join("") :
    `<div class="item"><span>No games played yet.</span></div>`);
}
let chart;
function drawStatsChart(){
  const level = $("#statsDifficulty").value;
  const stats = getStatsFor(users.current);
  renderHistoryList(level);
  const values = stats[level].history.map(h=>h.score);
  const labels = stats[level].history.map((_,i)=>i+1);
  const ctxChart = $("#statsChart").getContext("2d");
  if(chart) chart.destroy();
  chart = new Chart(ctxChart, {
    type: "line",
    data: {
      labels,
      datasets: [{ label:`Scores (${users.current} · ${level})`, data: values, tension: .3, borderColor:"#35ff88", pointRadius:3, pointBackgroundColor:"#6cf" }]
    },
    options: {
      responsive: false,
      plugins:{ legend:{ labels:{ color:"#e8f1ff" } } },
      scales:{
        x:{ ticks:{ color:"#9fb3c8" }, grid:{ color:"#1f2734" } },
        y:{ ticks:{ color:"#9fb3c8" }, grid:{ color:"#1f2734" }, beginAtZero:true }
      }
    }
  });
}

// ====== Fit canvases (responsive CSS scale) ======
function fitCanvases(){
  const scale = Math.min(window.innerWidth/WIDTH, (window.innerHeight-40)/HEIGHT);
  const w = Math.floor(WIDTH*scale), h = Math.floor(HEIGHT*scale);
  ["gameCanvas","introCanvas"].forEach(id=>{
    const el = document.getElementById(id);
    el.style.width = w+"px"; el.style.height = h+"px";
  });
}
window.addEventListener("resize", fitCanvases);
fitCanvases();
