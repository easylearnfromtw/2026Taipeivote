'use strict';

// A small, open-front living room keeps the television visible from every preset view.
function createLivingRoom({ stage, candidates }) {
  if (!window.THREE || typeof createCanvasRenderer !== 'function') throw new Error('3D is unavailable');
  const T = window.THREE;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'room-canvas';
  const options = { antialias: true, alpha: false };
  const gl = canvas.getContext('webgl2', options) || canvas.getContext('webgl', options);
  const renderer = gl ? new T.WebGLRenderer({ canvas, context: gl, antialias: true })
    : createCanvasRenderer(T, canvas, { background: '#e5eff7', renderFloorMesh: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gl ? 2 : 1.25));
  const scene = new T.Scene();
  scene.background = new T.Color(0xe5eff7);
  const camera = new T.PerspectiveCamera(39, 1, .1, 40);
  scene.add(new T.HemisphereLight(0xffffff, 0x9b9384, 1.1));
  const sun = new T.DirectionalLight(0xfff8e9, .65);
  sun.position.set(2.5, 5, 4);
  scene.add(sun);
  const materials = {};
  function mat(color) {
    return materials[color] ||= new T.MeshStandardMaterial({ color, roughness: .86 });
  }
  function box(parent, color, size, pos, rotation = 0) {
    const mesh = new T.Mesh(new T.BoxGeometry(...size), mat(color));
    mesh.position.set(...pos);
    mesh.rotation.z = rotation;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, color, radiusTop, radiusBottom, height, pos, segments = 10) {
    const mesh = new T.Mesh(new T.CylinderGeometry(radiusTop, radiusBottom, height, segments), mat(color));
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  }
  function canvasMaterial(draw, width, height) {
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    const ctx = image.getContext('2d');
    draw(ctx, width, height);
    const texture = new T.CanvasTexture(image);
    texture.minFilter = T.LinearFilter;
    return { image, ctx, texture, material: new T.MeshBasicMaterial({ map: texture }) };
  }
  function plane(parent, material, width, height, pos) {
    const mesh = new T.Mesh(new T.PlaneGeometry(width, height), material);
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  }
  function rounded(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // Cutaway walls, tiled floor and wood skirting.
  box(scene, '#e7ded1', [5.8, .12, 4.25], [0, -.08, -.05]).renderOrder = -2;
  for (let x = -2.4; x <= 2.4; x += .6) box(scene, '#c9b8a5', [.012, .006, 4.1], [x, -.015, -.05]).renderOrder = -1;
  for (let z = -1.8; z <= 1.8; z += .6) box(scene, '#c9b8a5', [5.7, .006, .012], [0, -.014, z]).renderOrder = -1;
  box(scene, '#f4f0e7', [5.8, 3.1, .12], [0, 1.55, -2.16]).renderOrder = -3;
  box(scene, '#e8e6df', [.12, 3.1, 2.2], [-2.9, 1.55, -1.05]).renderOrder = -3;
  box(scene, '#e7e5df', [.12, 3.1, 2.2], [2.9, 1.55, -1.05]).renderOrder = -3;
  box(scene, '#987e66', [5.65, .12, .035], [0, .07, -2.08]);
  box(scene, '#d3c6b2', [5.7, .05, .07], [0, 3.03, -2.06]);

  // Familiar Taiwanese aluminium sliding window and security grille.
  const windowGroup = new T.Group();
  windowGroup.position.set(-1.82, 2.06, -2.075);
  scene.add(windowGroup);
  box(windowGroup, '#f6f4ea', [1.38, 1.16, .05], [0, 0, 0]);
  box(windowGroup, '#9fc7d0', [1.22, 1.0, .035], [0, 0, .036]);
  box(windowGroup, '#d9eced', [.56, .89, .012], [-.31, 0, .058]);
  box(windowGroup, '#b8d7dc', [.56, .89, .012], [.31, 0, .06]);
  for (let x = -.61; x <= .62; x += .305) box(windowGroup, '#d9dfd8', [.025, 1.0, .05], [x, 0, .08]);
  for (let y = -.5; y <= .51; y += .25) box(windowGroup, '#d9dfd8', [1.24, .025, .05], [0, y, .08]);
  for (const side of [-1, 1]) {
    box(windowGroup, '#c8cec7', [.42, .025, .04], [side * .21, 0, .11], side * Math.PI / 4);
    box(windowGroup, '#c8cec7', [.42, .025, .04], [side * .21, 0, .11], -side * Math.PI / 4);
  }
  box(windowGroup, '#8d8273', [1.46, .07, .17], [0, -.59, .08]);
  windowGroup.children.forEach((child, index) => { child.renderOrder = 1 + index; });

  const calendar = canvasMaterial((ctx,w,h) => {
    ctx.fillStyle = '#faf5e8'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#b7382f'; ctx.fillRect(0,0,w,48);
    ctx.fillStyle = '#fff8e9'; ctx.font = 'bold 27px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('民國 115 年',w/2,34);
    ctx.fillStyle = '#374256'; ctx.font = 'bold 26px sans-serif'; ctx.fillText('十一月',w/2,87);
    ctx.fillStyle = '#c6362c'; ctx.font = 'bold 110px sans-serif'; ctx.fillText('28',w/2,205);
    ctx.font = 'bold 19px sans-serif'; ctx.fillStyle = '#46546b'; ctx.fillText('星期六 · 投票日',w/2,241);
  }, 200, 260);
  box(scene, '#ad9e86', [.59, .79, .035], [1.95, 2.06, -2.075]);
  plane(scene, calendar.material, .54, .73, [1.95, 2.06, -2.05]).renderOrder = 1;
  box(scene, '#8c7b68', [.13, .025, .03], [1.95, 2.48, -2.03]);

  // The cabinet is three-dimensional; its screen and grille use a live canvas texture.
  const tv = new T.Group();
  tv.position.set(0, 0, -1.73);
  scene.add(tv);
  box(tv, '#171917', [1.85, 1.55, .48], [0, 1.12, 0]);
  box(tv, '#343631', [1.94, .07, .53], [0, 1.92, 0]);
  box(tv, '#0d100e', [1.79, .06, .47], [0, .34, 0]);
  for (const x of [-.72, .72]) for (const z of [-.12, .15]) {
    const leg = box(tv, '#252722', [.07, .34, .07], [x, .17, z]);
    leg.rotation.z = x < 0 ? -.10 : .10;
  }
  const tvFace = canvasMaterial(() => {}, 1024, 900);
  plane(tv, tvFace.material, 1.76, 1.45, [0, 1.12, .247]).renderOrder = 1;
  function drawTelevision(number) {
    const ctx = tvFace.ctx, w = 1024, h = 900;
    ctx.fillStyle = '#151715'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = '#666255'; ctx.lineWidth = 8; ctx.strokeRect(18,18,w-36,h-36);
    ctx.fillStyle = '#bdaf90'; ctx.fillRect(35,36,954,490);
    ctx.fillStyle = '#d5c6a4'; ctx.fillRect(47,48,930,466);
    for (const x of [53, 877]) {
      ctx.fillStyle = '#b7a98c'; ctx.fillRect(x,58,89,438);
      ctx.fillStyle = '#e5d9bf'; ctx.fillRect(x+6,63,77,420);
      ctx.strokeStyle = '#948b77'; ctx.lineWidth = 2;
      for (let y=68; y<438; y+=7) { ctx.beginPath();ctx.moveTo(x+9,y);ctx.lineTo(x+79,y);ctx.stroke(); }
    }
    rounded(ctx,148,52,728,454,44); ctx.fillStyle='#343a38'; ctx.fill();
    rounded(ctx,162,65,700,427,36); ctx.fillStyle='#102e50'; ctx.fill();
    ctx.save(); rounded(ctx,162,65,700,427,36); ctx.clip();
    ctx.fillStyle='#dceeff'; ctx.fillRect(162,65,700,58);
    ctx.fillStyle='#183b69'; ctx.font='bold 27px sans-serif'; ctx.textAlign='left'; ctx.fillText('模擬開票',185,103);
    ctx.textAlign='right'; ctx.fillText(number ? '1 張練習票' : '0 張練習票',840,103);
    ctx.font='bold 31px sans-serif';
    candidates.forEach((person,i) => {
      const y=164+i*48, selected=person.number===number;
      ctx.textAlign='left'; ctx.fillStyle='#eef6ff'; ctx.fillText(`${person.number}  ${person.name}`,188,y);
      ctx.fillStyle=selected?'#f5a45c':'#6486a7'; ctx.fillRect(425,y-17,selected?295:180,7);
      ctx.textAlign='right'; ctx.fillStyle='#fff'; ctx.fillText(selected?'1':'0',835,y);
    });
    ctx.fillStyle='#d6e9ff'; ctx.font='23px sans-serif';ctx.textAlign='left';ctx.fillText('本輪練習票',188,468);
    ctx.restore();
    for (const x of [78,112,924]) {
      ctx.beginPath();ctx.arc(x,463,x===924?20:12,0,Math.PI*2);ctx.fillStyle='#292a26';ctx.fill();ctx.strokeStyle='#c0b8a7';ctx.lineWidth=5;ctx.stroke();
      ctx.beginPath();ctx.arc(x-4,458,3,0,Math.PI*2);ctx.fillStyle='#e1ded3';ctx.fill();
    }
    ctx.fillStyle='#101210'; ctx.fillRect(38,530,948,54);
    for (const x of [478,512,546]) { ctx.beginPath();ctx.arc(x,554,10,0,Math.PI*2);ctx.fillStyle='#a9a89f';ctx.fill();ctx.beginPath();ctx.arc(x,554,5,0,Math.PI*2);ctx.fillStyle='#353631';ctx.fill(); }
    ctx.fillStyle='#a59c8d';ctx.fillRect(40,596,944,260);
    ctx.strokeStyle='#d1c8b7';ctx.lineWidth=2;
    for (let y=600;y<855;y+=5) {ctx.beginPath();ctx.moveTo(44,y);ctx.lineTo(980,y);ctx.stroke();}
    ctx.strokeStyle='#dcd6ca';ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(423,725);ctx.bezierCurveTo(445,705,460,743,482,725);ctx.bezierCurveTo(495,715,505,715,512,733);ctx.bezierCurveTo(519,715,529,715,542,725);ctx.bezierCurveTo(564,743,579,705,601,725);ctx.stroke();
    tvFace.texture.needsUpdate=true;
  }
  drawTelevision(null);

  // Potted plant with individual three-dimensional leaves.
  const plant = new T.Group(); plant.position.set(-2.30, 0, -.87); scene.add(plant);
  cylinder(plant, '#bd6c42', .26, .18, .48, [0,.24,0], 12);
  cylinder(plant, '#d38a59', .28, .28, .08, [0,.47,0], 12);
  cylinder(plant, '#574b35', .23, .23, .025, [0,.52,0], 12);
  for (let i=0;i<10;i++) {
    const a=i*Math.PI*2/10, lean=.18+(i%3)*.07, h=.82+(i%3)*.12;
    const stem=cylinder(plant, '#547445', .012,.014,h-.46,[Math.sin(a)*lean/2,(h+.48)/2,Math.cos(a)*lean/2],6);
    stem.rotation.z=-Math.sin(a)*.25;stem.rotation.x=Math.cos(a)*.25;
    const leaf=new T.Mesh(new T.SphereGeometry(.14,8,6),mat(i%2?'#43845b':'#6c9b65'));
    leaf.position.set(Math.sin(a)*lean,h,Math.cos(a)*lean);leaf.scale.set(.65,1.5,.45);leaf.rotation.z=-Math.sin(a)*.8;leaf.rotation.x=Math.cos(a)*.8;plant.add(leaf);
  }

  // A blue fabric sofa faces the TV; an orange cushion echoes the site's palette.
  const sofa=new T.Group();sofa.position.set(1.75,0,.79);sofa.rotation.y=Math.PI/2;scene.add(sofa);
  box(sofa,'#345e82',[1.8,.3,.85],[0,.35,0]);
  box(sofa,'#426e90',[1.78,.8,.20],[0,.82,.32]);
  for (const x of [-.63,.63]) box(sofa,'#537fa0',[.16,.52,.88],[x*1.3,.60,0]);
  for (const x of [-.41,.41]) {
    box(sofa,'#6d94af',[.74,.13,.62],[x,.55,-.08]);
    box(sofa,'#5f88a5',[.75,.46,.15],[x,.86,.18]);
  }
  box(sofa,'#dc8a4b',[.31,.30,.12],[.41,.87,.065],-.12);
  for (const x of [-.68,.68]) for (const z of [-.25,.25]) cylinder(sofa,'#69513c',.035,.035,.20,[x,.10,z],8);
  const table=new T.Group();table.position.set(-.58,0,.82);scene.add(table);
  box(table,'#9b704e',[1.05,.10,.62],[0,.43,0]);
  for (const x of [-.42,.42]) for (const z of [-.21,.21]) box(table,'#715137',[.055,.39,.055],[x,.20,z]);
  cylinder(table,'#f5f1e7',.07,.055,.12,[.18,.54,0],10);
  cylinder(table,'#6b4c37',.054,.054,.008,[.18,.605,0],10);

  stage.appendChild(canvas);
  let frame=null, angle=0, view='overview', voteNumber=null, pointer=null, lastX=0;
  const views={overview:{target:[0,1.22,-.30],radius:7.3,y:3.1},tv:{target:[0,1.17,-1.70],radius:3.35,y:1.83},window:{target:[-1.77,1.94,-2.03],radius:3.0,y:2.25}};
  function queue() { if (frame===null) frame=requestAnimationFrame(draw); }
  function draw() {
    frame=null;
    if (!canvas.isConnected || !canvas.clientWidth || !canvas.clientHeight || canvas.hidden) return;
    const width=canvas.clientWidth,height=canvas.clientHeight,pixelRatio=renderer.getPixelRatio();
    if (canvas.width!==Math.round(width*pixelRatio)||canvas.height!==Math.round(height*pixelRatio)) {
      renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
    }
    const v=views[view],target=new T.Vector3(...v.target);
    camera.position.set(target.x+Math.sin(angle)*v.radius,v.y,target.z+Math.cos(angle)*v.radius);
    camera.lookAt(target);
    renderer.render(scene,camera);
  }
  canvas.addEventListener('pointerdown',event=>{
    if(pointer!==null||!event.isPrimary||event.button!==0)return;
    pointer=event.pointerId;lastX=event.clientX;canvas.setPointerCapture(pointer);canvas.toggleAttribute('data-dragging',true);
  });
  canvas.addEventListener('pointermove',event=>{
    if(event.pointerId!==pointer)return;
    angle=Math.max(-.48,Math.min(.48,angle-(event.clientX-lastX)*.005));lastX=event.clientX;queue();
  });
  function finish(event){if(event.pointerId!==pointer)return;pointer=null;canvas.removeAttribute('data-dragging');}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,finish);
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();canvas.hidden=true;
    const status=stage.querySelector('.room-status');
    if(status){status.textContent='客廳場景暫時無法顯示，下方仍可查看開票結果。';status.hidden=false;}
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    canvas.hidden=false;const status=stage.querySelector('.room-status');if(status)status.hidden=true;queue();
  });
  if('ResizeObserver' in window) new ResizeObserver(queue).observe(stage);
  else window.addEventListener('resize',queue);
  return {
    show(){queue();},
    setView(next){if(!views[next])return;view=next;angle=0;queue();},
    setVote(number){if(voteNumber===number)return;voteNumber=number;drawTelevision(number);queue();},
  };
}
