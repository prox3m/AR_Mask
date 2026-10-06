/* ============================================================
БАЗОВЫЕ МАСКИ
============================================================ */
const baseMasks = [
{
id: 'mask-kratos',
name: 'Kratos (2D)',
type: '2d',
file: 'assets/kratos.png',
position: { x: 0, y: 0, z: 0 },
rotation: { x: 0, y: 0, z: 0 },
scale:    { x: 1, y: 1, z: 1 },
autoPlay: false,
loop: 'repeat',
mirrorX: false,
isBase: true
},
{
id: 'mask-horns',
name: 'Horns (3D)',
type: '3d',
file: 'assets/horns.glb',
position: { x: 0, y: 0, z: 0 },
rotation: { x: 0, y: 0, z: 0 },
scale:    { x: 1, y: 1, z: 1 },
autoPlay: false,
loop: 'repeat',
mirrorX: true,
isBase: true
},
{
id: 'mask-bucket',
name: 'Bucket (3D + анимация)',
type: '3d-animated',
file: 'assets/bucket.glb',
position: { x: 0, y: 0, z: 0 },
rotation: { x: 0, y: 0, z: 0 },
scale:    { x: 1, y: 1, z: 1 },
autoPlay: true,
loop: 'repeat',
mirrorX: true,
isBase: true
}
];
let customMasks = [];
let masksConfig = [];
let currentIndex = 0;
let uploadedFiles = {};
const statusDiv = document.getElementById('status');

/* ============================================================
НАСТРОЙКИ СКРЫТИЯ МАСКИ ПО ОРИЕНТАЦИИ ЛИЦА
dot = направление лица · направление на камеру:
1.0 — лицо строго к камере
0.0 — профиль (90°)
-1.0 — затылок
Порог:
0.50 — прячется при ~60° (уже за «три четверти»)
0.30 — прячется при ~72°
0.15 — прячется при ~81°
0.05 — прячется почти при 90°
============================================================ */
const FACE_VISIBILITY_DOT_THRESHOLD = 0.30;
// Если вдруг знак оси Zappar окажется обратным — поставь true
const INVERT_FACE_AXIS = false;

/* ============================================================
УТИЛИТЫ
============================================================ */
function updateStatus(message, isError = false) {
statusDiv.textContent = message;
statusDiv.className = 'status' + (isError ? ' error' : '');
console.log('[Mask App]', message);
}

function clearContainer(el) {
while (el.firstChild) el.removeChild(el.firstChild);
}

/* ============================================================
ОРИЕНТАЦИЯ ЛИЦА
Работает через matrixWorld, а не через quaternion, потому что
у Zappar'овского anchor'а матрица зеркальная (selfie-камера),
и декомпозиция в кватернион даёт неверный результат.
Возвращает dot (число) или null, если лицо не найдено.
============================================================ */
const _faceW = new THREE.Vector3();
const _camW  = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _faceZ = new THREE.Vector3();

function computeFaceDot() {
try {
const faceEl = document.getElementById('my-face-tracker');
const camEl  = document.getElementById('zappar-camera-entity');
if (!faceEl || !camEl) return null;

    const fc = faceEl.components && faceEl.components['zappar-face'];
     if (!fc || !fc.trackerGroup) return null;
     const tg = fc.trackerGroup;
     // Нет лица — прячем
     if (!tg.currentAnchor) return null;
     // Обновляем мировые матрицы
     tg.updateMatrixWorld(true);
     camEl.object3D.updateMatrixWorld(true);
     // Мировые позиции
     _faceW.setFromMatrixPosition(tg.matrixWorld);
     _camW.setFromMatrixPosition(camEl.object3D.matrixWorld);
     // Направление на камеру
     _toCam.subVectors(_camW, _faceW);
     if (_toCam.lengthSq() < 1e-8) return null;
     _toCam.normalize();
     // Локальная ось +Z лица в мире — из matrixWorld напрямую.
     // Three.js хранит матрицу по столбцам: элементы [8],[9],[10] —
     // это первые три числа третьего столбца, т.е. локальный Z в мире.
     const e = tg.matrixWorld.elements;
     _faceZ.set(e[8], e[9], e[10]);
     if (_faceZ.lengthSq() < 1e-8) return null;
     _faceZ.normalize();
     if (INVERT_FACE_AXIS) _faceZ.negate();
     return _faceZ.dot(_toCam);
 } catch (err) {
     console.warn('[Mask App] visibility error:', err);
     return null;
 }
}

function isFaceVisible() {
const dot = computeFaceDot();
if (dot === null) return false;      // лицо не найдено — прячем
return dot > FACE_VISIBILITY_DOT_THRESHOLD;
}

/* ============================================================
ПРИНУДИТЕЛЬНАЯ НАСТРОЙКА МАТЕРИАЛОВ 3D-МОДЕЛИ
============================================================ */
function forceMaterials(entity, mirrorX) {
const mesh = entity.getObject3D('mesh');
if (!mesh) return;
const targetSide = mirrorX ? THREE.DoubleSide : THREE.FrontSide;
mesh.traverse((node) => {
    if (!node.isMesh || !node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach((m) => {
        if (m.side !== targetSide) {
            m.side = targetSide;
            m.needsUpdate = true;
        }
    });
});
}

/* ============================================================
ОБНОВЛЕНИЕ ВИДИМОСТИ МАСОК
============================================================ */
function updateMaskVisibility() {
const visible = isFaceVisible();
masksConfig.forEach((mask, index) => {
    const el = document.getElementById(mask.id);
    if (!el || !el.object3D) return;
    el.object3D.visible = visible && (index === currentIndex);
});
}

function startVisibilityLoop() {
let lastDebug = 0;
function tick(now) {
requestAnimationFrame(tick);
updateMaskVisibility();

    if (window.__maskDebug && now - lastDebug > 500) {
        lastDebug = now;
        const dot = computeFaceDot();
        console.log('[Mask dot]',
            dot === null ? 'no face' : dot.toFixed(3),
            '| threshold:', FACE_VISIBILITY_DOT_THRESHOLD);
    }
}
requestAnimationFrame(tick);
}

/* ============================================================
АНИМАЦИИ
============================================================ */
function applyAnimationState(entity, mask, active) {
if (mask.type !== '3d-animated') return;
const loop      = mask.loop || 'repeat';
 const timeScale = active ? 1 : 0;
 entity.setAttribute('animation-mixer', {
     clip: '*',
     loop: loop,
     timeScale: timeScale,
     clampWhenFinished: loop === 'once'
 });

 if (active) {
     const reset = () => {
         const comp = entity.components['animation-mixer'];
         if (comp && comp.mixer && typeof comp.mixer.setTime === 'function') {
             try { comp.mixer.setTime(0); } catch (e) {}
         }
     };
     setTimeout(reset, 50);
     setTimeout(reset, 250);
 }
}

/* ============================================================
ИНИЦИАЛИЗАЦИЯ
============================================================ */
function init() {
updateStatus('🎥 Проверка библиотек...');
if (typeof AFRAME === 'undefined') {
     updateStatus('❌ A-Frame не загружен!', true);
     return;
 }
 if (!AFRAME.components['zappar-camera']) {
     updateStatus('❌ Zappar A-Frame не загружен!', true);
     return;
 }

 updateMasksConfig();
 renderMasksList();
 createMasksInScene();
 updateMaskVisibility();
 startVisibilityLoop();

 const cam = document.getElementById('zappar-camera-entity');
 if (cam) {
     cam.addEventListener('cameraerror', (e) => {
         updateStatus('❌ Ошибка камеры: ' + (e.detail || e), true);
     });
     cam.addEventListener('first-frame', () => {
         updateStatus('✅ Трекинг запущен | Масок: ' + masksConfig.length);
     });
 }

 updateStatus('✅ Камера активна | Масок: ' + masksConfig.length);
 console.log('[Mask App] Для отладки введи: window.__maskDebug = true');
}

function updateMasksConfig() {
masksConfig = [...baseMasks, ...customMasks];
}

/* ============================================================
ЗАГРУЗКА ФАЙЛА
============================================================ */
function handleFileUpload(event) {
const file = event.target.files[0];
if (!file) return;
const fileName = file.name.toLowerCase();
 let type = '';
 if (fileName.endsWith('.png')) {
     type = '2d';
 } else if (fileName.endsWith('.glb') || fileName.endsWith('.gltf')) {
     type = '3d';
 } else {
     alert('Неподдерживаемый формат! Используйте PNG или GLB/GLTF');
     return;
 }

 const blobUrl = URL.createObjectURL(file);
 const fileKey = 'custom_' + Date.now();
 uploadedFiles[fileKey] = blobUrl;

 const isAnimated = type === '3d' &&
     confirm('Эта 3D маска с анимацией?\n\nOK — с анимацией\nОтмена — без анимации');

 let loop = 'repeat';
 if (isAnimated) {
     loop = confirm('Анимация циклическая?\n\nOK — циклично\nОтмена — один раз')
         ? 'repeat' : 'once';
 }

 customMasks.push({
     id: fileKey,
     name: file.name.replace(/\.[^/.]+$/, ''),
     type: isAnimated ? '3d-animated' : type,
     file: blobUrl,
     position: { x: 0, y: 0, z: 0 },
     rotation: { x: 0, y: 0, z: 0 },
     scale:    { x: 1, y: 1, z: 1 },
     autoPlay: isAnimated,
     loop: loop,
     mirrorX: true,
     isBase: false,
     originalFileName: file.name
 });

 updateMasksConfig();
 renderMasksList();
 createMasksInScene();
 updateMaskVisibility();

 event.target.value = '';
 updateStatus('✅ Маска загружена | Всего: ' + masksConfig.length);
 alert(`Маска "${file.name}" успешно загружена!`);
}

/* ============================================================
УДАЛЕНИЕ / РЕДАКТИРОВАНИЕ
============================================================ */
function deleteCustomMask(index) {
const mask = customMasks[index];
if (!mask || mask.isBase) return;
if (!confirm(`Удалить маску "${mask.name}"?`)) return;

if (uploadedFiles[mask.id]) {
    URL.revokeObjectURL(uploadedFiles[mask.id]);
    delete uploadedFiles[mask.id];
}

customMasks.splice(index, 1);
updateMasksConfig();

if (currentIndex >= masksConfig.length) {
    currentIndex = Math.max(0, masksConfig.length - 1);
}

renderMasksList();
createMasksInScene();
updateMaskVisibility();
updateStatus('✅ Маска удалена | Всего: ' + masksConfig.length);
}

function updateCustomMask(index, field, value) {
const mask = customMasks[index];
if (!mask || mask.isBase) return;

const fields = field.split('.');
if (fields.length === 2) mask[fields[0]][fields[1]] = value;
else                     mask[field] = value;

createMasksInScene();
updateMaskVisibility();
}

/* ============================================================
ПАНЕЛЬ АДМИНА
============================================================ */
function renderMasksList() {
const container = document.getElementById('masks-list');
clearContainer(container);

baseMasks.forEach((mask) => {
     const div = document.createElement('div');
     div.className = 'mask-item base-mask';
     div.innerHTML = `
         <h3>${mask.name} <span class="badge">БАЗОВАЯ</span></h3>
         <label>Тип: <strong>${mask.type.toUpperCase()}</strong></label>
         <label>Файл: <small>${mask.file}</small></label>
         <label>Зеркало X: <strong>${mask.mirrorX ? 'да' : 'нет'}</strong></label>
     `;
     container.appendChild(div);
 });

 customMasks.forEach((mask, index) => {
     const div = document.createElement('div');
     div.className = 'mask-item';
     div.innerHTML = `
         <h3>${mask.name}</h3>
         <label>Название:
             <input type="text" value="${mask.name}"
                    onchange="updateCustomMask(${index}, 'name', this.value)">
         </label>
         <label>Тип:
             <select onchange="updateCustomMask(${index}, 'type', this.value)">
                 <option value="2d"          ${mask.type === '2d' ? 'selected' : ''}>2D (PNG)</option>
                 <option value="3d"          ${mask.type === '3d' ? 'selected' : ''}>3D (GLB)</option>
                 <option value="3d-animated" ${mask.type === '3d-animated' ? 'selected' : ''}>3D с анимацией</option>
             </select>
         </label>
         <label>Позиция (X Y Z):</label>
         <div class="coords">
             <input type="number" step="0.1" value="${mask.position.x}"
                    onchange="updateCustomMask(${index}, 'position.x', parseFloat(this.value))">
             <input type="number" step="0.1" value="${mask.position.y}"
                    onchange="updateCustomMask(${index}, 'position.y', parseFloat(this.value))">
             <input type="number" step="0.1" value="${mask.position.z}"
                    onchange="updateCustomMask(${index}, 'position.z', parseFloat(this.value))">
         </div>
         <label>Поворот (X Y Z) в градусах:</label>
         <div class="coords">
             <input type="number" step="1" value="${mask.rotation.x}"
                    onchange="updateCustomMask(${index}, 'rotation.x', parseFloat(this.value))">
             <input type="number" step="1" value="${mask.rotation.y}"
                    onchange="updateCustomMask(${index}, 'rotation.y', parseFloat(this.value))">
             <input type="number" step="1" value="${mask.rotation.z}"
                    onchange="updateCustomMask(${index}, 'rotation.z', parseFloat(this.value))">
         </div>
         <label>Масштаб (X Y Z):</label>
         <div class="coords">
             <input type="number" step="0.1" value="${mask.scale.x}"
                    onchange="updateCustomMask(${index}, 'scale.x', parseFloat(this.value))">
             <input type="number" step="0.1" value="${mask.scale.y}"
                    onchange="updateCustomMask(${index}, 'scale.y', parseFloat(this.value))">
             <input type="number" step="0.1" value="${mask.scale.z}"
                    onchange="updateCustomMask(${index}, 'scale.z', parseFloat(this.value))">
         </div>
         <label style="margin-top:10px;">
             <input type="checkbox" ${mask.mirrorX ? 'checked' : ''}
                    onchange="updateCustomMask(${index}, 'mirrorX', this.checked)">
             Зеркалить по X
         </label>
         <label>Цикл анимации:
             <select onchange="updateCustomMask(${index}, 'loop', this.value)">
                 <option value="repeat" ${mask.loop !== 'once' ? 'selected' : ''}>Циклично</option>
                 <option value="once"   ${mask.loop === 'once' ? 'selected' : ''}>Одинарно</option>
             </select>
         </label>
         <label style="margin-top:10px;">
             <input type="checkbox" ${mask.autoPlay ? 'checked' : ''}
                    onchange="updateCustomMask(${index}, 'autoPlay', this.checked)">
             Автопроигрывание
         </label>
         <button class="btn btn-delete" onclick="deleteCustomMask(${index})">🗑️ Удалить</button>
     `;
     container.appendChild(div);
 });
}

/* ============================================================
СОЗДАНИЕ МАСОК
============================================================ */
function createMasksInScene() {
const container = document.getElementById('masks-container');
clearContainer(container);

masksConfig.forEach((mask, index) => {
     const entity = document.createElement('a-entity');
     entity.id = mask.id;
     container.appendChild(entity);

     if (mask.type === '2d') {
         entity.setAttribute('geometry',
             'primitive: face-mesh; face: #my-face-tracker');
         entity.setAttribute('material', {
             src: `url(${mask.file})`,
             transparent: true,
             alphaTest: 0.01,
             shader: 'flat',
             side: 'front'
         });
         entity.setAttribute('position',
             `${mask.position.x} ${mask.position.y} ${mask.position.z}`);
         entity.setAttribute('rotation',
             `${mask.rotation.x} ${mask.rotation.y} ${mask.rotation.z}`);
         entity.setAttribute('scale',
             `${mask.scale.x} ${mask.scale.y} ${mask.scale.z}`);
     } else {
         entity.setAttribute('gltf-model', `url(${mask.file})`);
         entity.setAttribute('position',
             `${mask.position.x} ${mask.position.y} ${mask.position.z}`);
         entity.setAttribute('rotation',
             `${mask.rotation.x} ${mask.rotation.y} ${mask.rotation.z}`);
         
         const sx = mask.mirrorX ? -mask.scale.x : mask.scale.x;
         entity.setAttribute('scale',
             `${sx} ${mask.scale.y} ${mask.scale.z}`);
         
         entity.addEventListener('model-loaded', () => {
             forceMaterials(entity, mask.mirrorX);
         });

         if (mask.type === '3d-animated') {
             applyAnimationState(entity, mask, index === currentIndex);
         }
     }

     entity.setAttribute('visible', index === currentIndex);
 });
}

/* ============================================================
ПЕРЕКЛЮЧЕНИЕ
============================================================ */
function switchMask(direction) {
if (masksConfig.length === 0) return;
const oldMask = masksConfig[currentIndex];

 if (direction === 'next') {
     currentIndex = (currentIndex + 1) % masksConfig.length;
 } else {
     currentIndex = (currentIndex - 1 + masksConfig.length) % masksConfig.length;
 }

 const newMask = masksConfig[currentIndex];

 if (oldMask && oldMask.type === '3d-animated') {
     const el = document.getElementById(oldMask.id);
     if (el) applyAnimationState(el, oldMask, false);
 }

 if (newMask && newMask.type === '3d-animated') {
     const el = document.getElementById(newMask.id);
     if (el) applyAnimationState(el, newMask, true);
 }

 updateMaskVisibility();
 updateStatus('🎭 Маска ' + (currentIndex + 1) + ' из ' + masksConfig.length);
}

/* ============================================================
UI
============================================================ */
function bindTap(el, handler) {
if (!el) return;
let lastTouch = 0;
const fire = (e) => {
if (e.type === 'touchstart') lastTouch = Date.now();
if (e.type === 'click' && Date.now() - lastTouch < 500) return;
e.preventDefault();
e.stopPropagation();
handler();
};
el.addEventListener('click', fire, { passive: false });
el.addEventListener('touchstart', fire, { passive: false });
}

function toggleAdminPanel() {
document.getElementById('admin-panel').classList.toggle('hidden');
}

function closeAdminPanel() {
document.getElementById('admin-panel').classList.add('hidden');
}

bindTap(document.getElementById('btn-prev'),     () => switchMask('prev'));
bindTap(document.getElementById('btn-next'),     () => switchMask('next'));
bindTap(document.getElementById('toggle-panel'), toggleAdminPanel);
bindTap(document.getElementById('close-panel'),  closeAdminPanel);

document.addEventListener('click', (e) => {
const target = e.target.closest('#btn-prev, #btn-next, #toggle-panel, #close-panel');
if (!target) return;
e.preventDefault();
e.stopPropagation();
if (target.id === 'btn-prev')     switchMask('prev');
if (target.id === 'btn-next')     switchMask('next');
if (target.id === 'toggle-panel') toggleAdminPanel();
if (target.id === 'close-panel')  closeAdminPanel();
}, true);

/* ============================================================
СТАРТ
============================================================ */
document.querySelector('a-scene').addEventListener('loaded', init);