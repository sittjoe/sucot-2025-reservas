# 🔥 Instrucciones para Activar Firebase

## ✅ Paso 1: Crear Proyecto en Firebase

1. Ve a [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Haz clic en **"Agregar proyecto"** (Add project)
3. Nombre del proyecto: `sucot-avivia-2025`
4. Sigue los pasos (puedes desactivar Google Analytics si quieres)
5. Haz clic en **"Crear proyecto"**

---

## ✅ Paso 2: Crear Realtime Database

1. En el menú lateral izquierdo, busca y haz clic en **"Realtime Database"**
2. Haz clic en **"Crear base de datos"** (Create database)
3. **Ubicación**: Selecciona `United States (us-central1)` o la más cercana
4. **Reglas de seguridad**: Selecciona **"Empezar en modo de prueba"** (Start in test mode)
   - ⚠️ Nota: Estas reglas permiten lectura/escritura por 30 días. Más adelante puedes ajustarlas.
5. Haz clic en **"Habilitar"** (Enable)

---

## ✅ Paso 3: Obtener la Configuración

1. En el menú izquierdo, haz clic en el ícono de **engranaje ⚙️** → **"Configuración del proyecto"** (Project settings)
2. Baja hasta la sección **"Tus aplicaciones"** (Your apps)
3. Haz clic en el botón **`</>`** (Web) para agregar una aplicación web
4. **Nombre de la app**: `sucot-web`
5. **NO marques** "Firebase Hosting"
6. Haz clic en **"Registrar app"** (Register app)

---

## ✅ Paso 4: Copiar la Configuración

Te va a mostrar un código JavaScript similar a este:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyA...",
  authDomain: "sucot-avivia-2025.firebaseapp.com",
  databaseURL: "https://sucot-avivia-2025-default-rtdb.firebaseio.com",
  projectId: "sucot-avivia-2025",
  storageBucket: "sucot-avivia-2025.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

### 🔴 IMPORTANTE:
**Copia TODO el bloque `firebaseConfig` y envíamelo**

---

## 📝 Paso 5: Yo lo configuro

Cuando me envíes la configuración, yo:
1. La agregaré al archivo `firebase-config.js`
2. El sistema quedará funcionando inmediatamente
3. Todas las reservas se sincronizarán en tiempo real entre todos los usuarios

---

## 🎯 ¿Qué va a pasar después?

✅ **Las reservas se guardarán en Firebase** (no en el navegador)
✅ **Todos los usuarios verán las mismas reservas** (sincronización en tiempo real)
✅ **El admin verá todas las reservas** de todos los usuarios
✅ **Actualización automática**: Si alguien hace una reserva, todos la ven al instante

---

## 🔐 Configurar Reglas de Seguridad (Opcional - Después)

Si quieres más seguridad, puedes cambiar las reglas en Firebase:

1. Ve a **Realtime Database** → Pestaña **"Reglas"** (Rules)
2. Reemplaza con esto:

```json
{
  "rules": {
    "reservations": {
      ".read": true,
      ".write": true
    }
  }
}
```

Esto permite que cualquiera pueda leer y escribir reservas. Para más seguridad avanzada, podríamos implementar autenticación, pero para un sistema interno de edificio está bien.

---

## ❓ Problemas Comunes

### ❌ Error: "Firebase is not defined"
- Asegúrate de que los archivos estén en este orden en `index.html`:
  1. Firebase SDK
  2. `firebase-config.js`
  3. `script.js`

### ❌ Error: "Permission denied"
- Ve a Realtime Database → Reglas y asegúrate de que `".read": true` y `".write": true`

### ❌ No se actualizan las reservas
- Abre la consola del navegador (F12) y busca errores
- Verifica que el `databaseURL` sea correcto en `firebase-config.js`

---

## 🚀 Próximos Pasos

1. **Hazme llegar el `firebaseConfig`** que te dio Firebase
2. Yo lo configuro en el proyecto
3. Subimos los cambios a GitHub Pages
4. ¡Listo! El sistema funciona en tiempo real 🎉
