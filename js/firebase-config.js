/* Configuración de Firebase (Firestore).
   Se obtiene en: Consola de Firebase → Configuración del proyecto → Tus apps → App web → "Configuración del SDK".
   Estos valores son públicos por diseño (van en el navegador); la seguridad se controla con las reglas de Firestore.
   Mientras quede en null, la app funciona solo con los datos guardados en el dispositivo. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDihqbNXIsDhfPWH5V5-0k_30LD7ureOfM",
  authDomain: "mi-cartera-bmsc.firebaseapp.com",
  projectId: "mi-cartera-bmsc",
  storageBucket: "mi-cartera-bmsc.firebasestorage.app",
  messagingSenderId: "498553278143",
  appId: "1:498553278143:web:89403172499666ce1b400a",
  measurementId: "G-R2G3YH9B93"
};
/* Ejemplo:
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "mi-cartera-bmsc.firebaseapp.com",
  projectId: "mi-cartera-bmsc",
  storageBucket: "mi-cartera-bmsc.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123"
};
*/
