'use strict';

// Render the same scene with Canvas 2D when the browser cannot create a WebGL context.
function createCanvasRenderer(T, canvas) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  let pixelRatio = 1;
  let width = 1;
  let height = 1;
  const lightDirection = new T.Vector3(2.5, 5, 4).normalize();
  const normal = new T.Vector3();
  const edgeA = new T.Vector3();
  const edgeB = new T.Vector3();
  const toCamera = new T.Vector3();

  function texturedTriangle(triangle) {
    const [a, b, c] = triangle.points;
    const [uvA, uvB, uvC] = triangle.uvs;
    const image = triangle.image;
    const u0 = uvA.x * image.width;
    const v0 = (1 - uvA.y) * image.height;
    const u1 = uvB.x * image.width;
    const v1 = (1 - uvB.y) * image.height;
    const u2 = uvC.x * image.width;
    const v2 = (1 - uvC.y) * image.height;
    const determinant = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
    if (Math.abs(determinant) < 0.001) return;
    const ax = (a.x * (v1 - v2) + b.x * (v2 - v0) + c.x * (v0 - v1)) / determinant;
    const bx = (a.y * (v1 - v2) + b.y * (v2 - v0) + c.y * (v0 - v1)) / determinant;
    const ay = (a.x * (u2 - u1) + b.x * (u0 - u2) + c.x * (u1 - u0)) / determinant;
    const by = (a.y * (u2 - u1) + b.y * (u0 - u2) + c.y * (u1 - u0)) / determinant;
    const tx = (a.x * (u1 * v2 - u2 * v1) + b.x * (u2 * v0 - u0 * v2) + c.x * (u0 * v1 - u1 * v0)) / determinant;
    const ty = (a.y * (u1 * v2 - u2 * v1) + b.y * (u2 * v0 - u0 * v2) + c.y * (u0 * v1 - u1 * v0)) / determinant;
    context.save();
    context.clip();
    context.transform(ax, bx, ay, by, tx, ty);
    context.drawImage(image, 0, 0);
    context.restore();
  }

  function draw(scene, camera) {
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.fillStyle = '#dfe2e7';
    context.fillRect(0, 0, width, height);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const floorPosition = new T.Vector3(0, 0, 0).project(camera);
    const floorY = Math.min(height, Math.max(0, (1 - floorPosition.y) * height / 2));
    context.fillStyle = '#50545c';
    context.fillRect(0, floorY, width, height - floorY);
    const triangles = [];

    scene.traverse(object => {
      if (!object.isMesh || object.userData.isFloor || !object.visible) return;
      const geometry = object.geometry;
      const positions = geometry.attributes.position;
      const uvs = geometry.attributes.uv;
      const indices = geometry.index;
      if (!positions) return;
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (!material || !material.visible) return;
      const world = [];
      const projected = [];
      for (let index = 0; index < positions.count; index += 1) {
        const point = new T.Vector3().fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
        world.push(point);
        const screen = point.clone().project(camera);
        projected.push({ x: (screen.x + 1) * width / 2, y: (1 - screen.y) * height / 2, z: screen.z });
      }
      const vertexCount = indices ? indices.count : positions.count;
      for (let index = 0; index < vertexCount; index += 3) {
        const face = [0, 1, 2].map(offset => indices ? indices.getX(index + offset) : index + offset);
        const points = face.map(vertex => projected[vertex]);
        // A face crossing the near plane otherwise projects across the whole 2D canvas.
        if (points.some(point => point.z < -1 || point.z > 1 || !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
        edgeA.subVectors(world[face[1]], world[face[0]]);
        edgeB.subVectors(world[face[2]], world[face[0]]);
        normal.crossVectors(edgeA, edgeB).normalize();
        toCamera.subVectors(camera.position, world[face[0]]);
        if (material.side !== T.DoubleSide && normal.dot(toCamera) <= 0) continue;
        const brightness = material.isMeshBasicMaterial ? 1 : 0.54 + 0.46 * Math.max(0, normal.dot(lightDirection));
        const base = material.userData.canvasColor ? new T.Color(material.userData.canvasColor) : material.color;
        const channel = value => Math.min(255, Math.round(value * brightness * 255));
        const color = base ? `rgb(${channel(base.r)},${channel(base.g)},${channel(base.b)})` : '#777';
        const image = material.map && !material.userData.canvasColor ? material.map.image : null;
        triangles.push({
          points,
          layer: object.renderOrder,
          depth: (points[0].z + points[1].z + points[2].z) / 3,
          color,
          image,
          uvs: image && uvs ? face.map(vertex => ({ x: uvs.getX(vertex), y: uvs.getY(vertex) })) : null,
        });
      }
    });

    triangles.sort((first, second) => first.layer - second.layer || second.depth - first.depth);
    for (const triangle of triangles) {
      const [a, b, c] = triangle.points;
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.lineTo(c.x, c.y);
      context.closePath();
      context.fillStyle = triangle.color;
      context.fill();
      if (triangle.image && triangle.uvs) texturedTriangle(triangle);
      else {
        context.strokeStyle = triangle.color;
        context.lineWidth = 0.5;
        context.stroke();
      }
    }
  }

  return {
    shadowMap: { enabled: false },
    setPixelRatio(value) { pixelRatio = Math.min(value, 1.5); },
    getPixelRatio() { return pixelRatio; },
    setSize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
    },
    render: draw,
  };
}


// The booth dimensions, materials and camera follow the original voting-station model.
function createVotingBooth({ candidates, onPick, onBox }) {
  if (!window.THREE) throw new Error('Three.js is unavailable');

  const T = window.THREE;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const contextOptions = { antialias: true, alpha: true };
  const gl = canvas.getContext('webgl2', contextOptions) || canvas.getContext('webgl', contextOptions);
  const renderer = gl
    ? new T.WebGLRenderer({ canvas, context: gl, antialias: true })
    : createCanvasRenderer(T, canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  const scene = new T.Scene();
  scene.background = new T.Color(0xdfe2e7);
  scene.fog = new T.Fog(0xdfe2e7, 7, 15);
  const camera = new T.PerspectiveCamera(38, 1, 0.1, 40);
  scene.add(new T.HemisphereLight(0xffffff, 0x80838a, 0.9));

  const light = new T.DirectionalLight(0xffffff, 0.75);
  light.position.set(2.5, 5, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3 });
  scene.add(light);

  function texturedMaterial(color, dots, repeat) {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = textureCanvas.height = 128;
    const context = textureCanvas.getContext('2d');
    context.fillStyle = color;
    context.fillRect(0, 0, 128, 128);
    for (let index = 0; index < dots; index += 1) {
      context.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.09)';
      context.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
    }
    const texture = new T.CanvasTexture(textureCanvas);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    const material = new T.MeshStandardMaterial({ map: texture, roughness: 1 });
    material.userData.canvasColor = color;
    return material;
  }

  const felt = texturedMaterial('#80868e', 3500, 2);
  const carpet = texturedMaterial('#4b4f57', 6000, 14);
  const metal = new T.MeshStandardMaterial({ color: 0xe4e7ec, metalness: 0.9, roughness: 0.25 });
  const white = new T.MeshStandardMaterial({ color: 0xf2f3f5, roughness: 0.6 });

  function mesh(geometry, material, x, y, z, castsShadow = true) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = castsShadow;
    object.receiveShadow = true;
    return object;
  }

  const floor = mesh(new T.PlaneGeometry(14, 14), carpet, 0, 0, 0, false);
  floor.rotation.x = -Math.PI / 2;
  floor.userData.isFloor = true;
  scene.add(floor);

  function signMaterial(text, width, height) {
    const sign = document.createElement('canvas');
    sign.width = width * 4;
    sign.height = height * 4;
    const context = sign.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, sign.width, sign.height);
    context.strokeStyle = '#d22';
    context.lineWidth = 14;
    context.strokeRect(7, 7, sign.width - 14, sign.height - 14);
    context.fillStyle = '#d22';
    context.font = `bold ${height * 2}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, sign.width / 2, sign.height / 2 + 4);
    return new T.MeshBasicMaterial({ map: new T.CanvasTexture(sign) });
  }

  const ballotCanvas = document.createElement('canvas');
  ballotCanvas.width = 768;
  ballotCanvas.height = 600;
  const ballotTexture = new T.CanvasTexture(ballotCanvas);
  let ballotMesh;
  let markedNumber = null;
  let animation = null;
  let depositAnimation = null;
  let frameRequest = null;
  let orbit = 0;
  let zoom = 0;
  let view = 'overview';
  let cameraReady = false;
  const currentLook = new T.Vector3();
  const target = new T.Vector3(0, 0.65, 0.35);
  const rowTop = 70;
  const rowSpacing = 82;
  const rowHeight = 76;

  function drawBallot(number) {
    const context = ballotCanvas.getContext('2d');
    context.fillStyle = '#fffdf5';
    context.fillRect(0, 0, ballotCanvas.width, ballotCanvas.height);
    context.fillStyle = '#222';
    context.font = 'bold 30px sans-serif';
    context.textAlign = 'center';
    context.fillText('臺北市長選舉票（模擬）', 384, 42);

    candidates.forEach((candidate, index) => {
      const y = rowTop + index * rowSpacing;
      context.strokeStyle = '#343434';
      context.lineWidth = 3;
      context.strokeRect(24, y, 720, rowHeight);
      context.fillStyle = '#1f5fd1';
      context.fillRect(34, y + 9, 10, rowHeight - 18);
      context.textAlign = 'left';
      context.fillStyle = '#222';
      context.font = 'bold 28px sans-serif';
      context.fillText(`${candidate.number}  ${candidate.name}`, 62, y + 31, 490);
      context.font = '20px sans-serif';
      context.fillStyle = '#555';
      context.fillText(candidate.party, 62, y + 60, 520);
      context.strokeStyle = '#777';
      context.lineWidth = 2;
      context.strokeRect(646, y + 9, 74, 58);
      if (candidate.number === number) {
        context.strokeStyle = '#d22';
        context.fillStyle = '#d22';
        context.lineWidth = 5;
        context.beginPath();
        context.arc(683, y + 38, 25, 0, Math.PI * 2);
        context.stroke();
        context.font = 'bold 25px sans-serif';
        context.textAlign = 'center';
        context.fillText('蓋', 683, y + 47);
      }
    });
    ballotTexture.needsUpdate = true;
  }

  function addBooth(x, hasBallot) {
    const booth = new T.Group();
    booth.position.x = x;
    const width = 1;
    const depth = 0.6;
    const height = 1.55;
    booth.add(mesh(new T.BoxGeometry(width, height - 0.2, 0.04), felt, 0, (height + 0.2) / 2, -depth / 2));
    for (const side of [-1, 1]) {
      booth.add(mesh(new T.BoxGeometry(0.04, height - 0.2, depth), felt, side * width / 2, (height + 0.2) / 2, 0));
      for (const end of [-1, 1]) {
        booth.add(mesh(new T.CylinderGeometry(0.014, 0.014, height + 0.05, 10), metal,
          side * width / 2, (height + 0.05) / 2, end * depth / 2));
      }
      const sideRail = mesh(new T.CylinderGeometry(0.012, 0.012, depth, 10), metal, side * width / 2, height + 0.05, 0);
      sideRail.rotation.x = Math.PI / 2;
      booth.add(sideRail);
    }
    for (const end of [-1, 1]) {
      const rail = mesh(new T.CylinderGeometry(0.012, 0.012, width, 10), metal, 0, height + 0.05, end * depth / 2);
      rail.rotation.z = Math.PI / 2;
      booth.add(rail);
    }
    booth.add(mesh(new T.BoxGeometry(width - 0.04, 0.035, 0.46), white, 0, 0.95, 0.02));
    booth.add(mesh(new T.BoxGeometry(0.46, height - 0.35, 0.025), felt, -0.3, (height + 0.2) / 2 - 0.1, depth / 2 + 0.01));
    const sign = new T.Mesh(new T.PlaneGeometry(0.56, 0.14), signMaterial('圈票處', 140, 35));
    sign.renderOrder = 1;
    sign.position.set(0, height + 0.16, -depth / 2 + 0.04);
    booth.add(sign);
    if (hasBallot) {
      ballotMesh = new T.Mesh(new T.PlaneGeometry(0.46, 0.36), new T.MeshStandardMaterial({ map: ballotTexture, roughness: 0.8 }));
      ballotMesh.renderOrder = 1;
      ballotMesh.rotation.x = -Math.PI / 2;
      ballotMesh.position.set(0, 0.971, 0.02);
      ballotMesh.receiveShadow = true;
      booth.add(ballotMesh);
    }
    scene.add(booth);
  }

  addBooth(0, true);
  addBooth(-1.25, false);
  addBooth(1.25, false);

  const ballotBox = new T.Group();
  ballotBox.position.set(0, 0, 1.5);
  ballotBox.add(mesh(new T.BoxGeometry(0.42, 0.6, 0.34), felt, 0, 0.3, 0));
  ballotBox.add(mesh(new T.BoxGeometry(0.2, 0.012, 0.02), new T.MeshBasicMaterial({ color: 0x111111 }), 0, 0.607, 0, false));
  const boxSign = new T.Mesh(new T.PlaneGeometry(0.3, 0.1), signMaterial('投票箱', 120, 40));
  boxSign.renderOrder = 1;
  boxSign.position.set(0, 0.36, 0.175);
  ballotBox.add(boxSign);
  scene.add(ballotBox);

  const stamp = new T.Group();
  const redInk = new T.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.5 });
  const wood = new T.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.6 });
  stamp.add(mesh(new T.BoxGeometry(0.07, 0.03, 0.07), redInk, 0, 0.015, 0));
  stamp.add(mesh(new T.CylinderGeometry(0.02, 0.026, 0.14, 14), wood, 0, 0.1, 0));
  stamp.add(mesh(new T.SphereGeometry(0.035, 14, 10), wood, 0, 0.19, 0));
  stamp.children.forEach(part => { part.renderOrder = 2; });
  stamp.position.set(0.3, 1.35, 0.6);
  scene.add(stamp);
  const foldedPaper = mesh(new T.BoxGeometry(0.2, 0.009, 0.15), white, 0, 1.05, 0.02);
  foldedPaper.renderOrder = 2;
  foldedPaper.visible = false;
  scene.add(foldedPaper);
  drawBallot(null);

  const ease = amount => amount * amount * (3 - 2 * amount);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function queueFrame() {
    if (frameRequest === null) frameRequest = requestAnimationFrame(drawFrame);
  }

  function finishDeposit() {
    if (!depositAnimation) return;
    const { resolve, timeout } = depositAnimation;
    clearTimeout(timeout);
    depositAnimation = null;
    foldedPaper.visible = false;
    ballotMesh.visible = true;
    queueFrame();
    resolve();
  }

  function drawFrame(now) {
    frameRequest = null;
    if (!canvas.isConnected || !canvas.clientWidth || !canvas.clientHeight || canvas.hidden) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelRatio = renderer.getPixelRatio();
    if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }

    zoom += ((animation ? 1 : 0) - zoom) * 0.09;
    const transition = view === 'ballot' ? 0 : ease(zoom);
    const radius = 4.2;
    const shake = animation?.impactTime ? Math.exp(-(now - animation.impactTime) / 90) * 0.025 : 0;
    let normalPosition = new T.Vector3(target.x + Math.sin(orbit) * radius, 1.75, target.z + Math.cos(orbit) * radius);
    let normalTarget = target.clone();
    if (view === 'ballot') {
      normalPosition = new T.Vector3(Math.sin(orbit) * 0.23, 1.65, 0.02 + Math.cos(orbit) * 0.23);
      normalTarget = new T.Vector3(0, 0.971, 0.02);
    } else if (view === 'box') {
      if (depositAnimation) {
        normalPosition = new T.Vector3(Math.sin(orbit) * 2.75, 1.6, 1.25 + Math.cos(orbit) * 2.75);
        normalTarget = new T.Vector3(0, 0.65, 1.25);
      } else {
        normalPosition = new T.Vector3(Math.sin(orbit) * 1.9, 1.3, 1.5 + Math.cos(orbit) * 1.9);
        normalTarget = new T.Vector3(0, 0.38, 1.5);
      }
    }
    const closePosition = new T.Vector3(stamp.position.x * 0.5 + Math.sin(orbit) * 0.25, 1.5 - shake, 0.02 + Math.cos(orbit) * 0.9);
    const closeTarget = new T.Vector3(stamp.position.x * 0.7, 0.97, 0.02);
    const desiredPosition = normalPosition.lerp(closePosition, transition);
    const desiredLook = normalTarget.lerp(closeTarget, transition);
    if (!cameraReady || reducedMotion.matches) {
      camera.position.copy(desiredPosition);
      currentLook.copy(desiredLook);
      cameraReady = true;
    } else {
      camera.position.lerp(desiredPosition, 0.18);
      currentLook.lerp(desiredLook, 0.18);
    }
    camera.lookAt(currentLook);

    if (animation) {
      const elapsed = (now - animation.startedAt) / 1000;
      const rowIndex = candidates.findIndex(candidate => candidate.number === animation.number);
      const stampX = 0.18;
      const stampZ = 0.02 + ((rowTop + rowIndex * rowSpacing + rowHeight / 2) / ballotCanvas.height - 0.5) * 0.36;
      const hoverY = 1.3;
      const lowY = 0.99;
      let x = stamp.position.x;
      let y = hoverY;
      let z = stamp.position.z;
      if (elapsed < 0.4) {
        const progress = ease(elapsed / 0.4);
        x = animation.from.x + (stampX - animation.from.x) * progress;
        z = animation.from.z + (stampZ - animation.from.z) * progress;
        y = animation.from.y + (hoverY - animation.from.y) * progress;
      } else if (elapsed < 0.58) {
        x = stampX;
        z = stampZ;
        y = hoverY + (lowY - hoverY) * ease((elapsed - 0.4) / 0.18);
      } else if (elapsed < 0.72) {
        x = stampX;
        z = stampZ;
        y = lowY;
        if (!animation.impactTime) {
          animation.impactTime = now;
          drawBallot(animation.number);
        }
      } else if (elapsed < 1.1) {
        x = stampX;
        z = stampZ;
        y = lowY + (hoverY - lowY) * ease((elapsed - 0.72) / 0.38);
      } else {
        // Draw even if a backgrounded tab skipped the impact frames.
        drawBallot(animation.number);
        animation = null;
      }
      stamp.position.set(x, y, z);
    }
    if (depositAnimation) {
      const elapsed = now - depositAnimation.startedAt;
      if (elapsed < 1100) {
        const progress = ease(Math.max(0, elapsed) / 1100);
        foldedPaper.position.set(0, 1.05 + Math.sin(progress * Math.PI) * 0.2, 0.02 + 1.48 * progress);
        foldedPaper.rotation.x = Math.PI / 2 * progress;
      } else if (elapsed < 1750) {
        const progress = ease((elapsed - 1100) / 650);
        foldedPaper.position.set(0, 1.05 - 0.5 * progress, 1.5);
        foldedPaper.rotation.x = Math.PI / 2;
      } else finishDeposit();
    }
    renderer.render(scene, camera);
    if (animation || depositAnimation || zoom > 0.01
      || camera.position.distanceToSquared(desiredPosition) > 0.00001
      || currentLook.distanceToSquared(desiredLook) > 0.00001) queueFrame();
  }

  let activePointer = null;
  let lastX = 0;
  let moved = 0;
  canvas.addEventListener('pointerdown', event => {
    if (activePointer !== null || !event.isPrimary || event.button !== 0) return;
    activePointer = event.pointerId;
    lastX = event.clientX;
    moved = 0;
    canvas.setPointerCapture(activePointer);
    canvas.toggleAttribute('data-dragging', true);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    const distance = event.clientX - lastX;
    moved += Math.abs(distance);
    orbit = Math.max(-0.55, Math.min(0.55, orbit - distance * 0.006));
    lastX = event.clientX;
    queueFrame();
  });
  function finishPointer(event) {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    canvas.removeAttribute('data-dragging');
    if (event.type !== 'pointerup' || moved >= 6) return;
    const bounds = canvas.getBoundingClientRect();
    const pointer = new T.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1,
      -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    const raycaster = new T.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([ballotMesh, ballotBox], true)[0];
    if (!hit) return;
    if (hit.object !== ballotMesh) {
      onBox();
      return;
    }
    const y = (1 - hit.uv.y) * ballotCanvas.height;
    const index = Math.floor((y - rowTop) / rowSpacing);
    if (index >= 0 && index < candidates.length && (y - rowTop) % rowSpacing < rowHeight) {
      onPick(candidates[index].number);
    }
  }
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    canvas.addEventListener(eventName, finishPointer);
  }
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    canvas.hidden = true;
    document.querySelectorAll('.scene-status').forEach(status => {
      status.hidden = false;
      status.textContent = '3D 場景暫時無法顯示，仍可使用練習選票。';
    });
  });
  canvas.addEventListener('webglcontextrestored', () => {
    canvas.hidden = false;
    document.querySelectorAll('.scene-status').forEach(status => { status.hidden = true; });
    queueFrame();
  });

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(queueFrame);
    document.querySelectorAll('.scene-stage').forEach(stage => observer.observe(stage));
  } else {
    window.addEventListener('resize', queueFrame);
  }

  return {
    showIn(stage) {
      if (canvas.parentElement !== stage) stage.appendChild(canvas);
      queueFrame();
    },
    setView(nextView) {
      view = nextView;
      orbit = 0;
      queueFrame();
    },
    setMark(number) {
      if (number === markedNumber && !animation) return;
      markedNumber = number;
      animation = null;
      drawBallot(number);
      queueFrame();
    },
    stamp(number) {
      markedNumber = number;
      if (reducedMotion.matches) {
        drawBallot(number);
      } else {
        drawBallot(null);
        animation = { number, startedAt: performance.now(), from: stamp.position.clone(), impactTime: 0 };
      }
      queueFrame();
    },
    deposit() {
      if (reducedMotion.matches || !canvas.isConnected || canvas.hidden) return Promise.resolve();
      if (depositAnimation) finishDeposit();
      foldedPaper.position.set(0, 1.05, 0.02);
      foldedPaper.rotation.set(0, 0, 0);
      foldedPaper.visible = true;
      ballotMesh.visible = false;
      return new Promise(resolve => {
        depositAnimation = { resolve, startedAt: performance.now(), timeout: setTimeout(finishDeposit, 2500) };
        queueFrame();
      });
    },
  };
}
