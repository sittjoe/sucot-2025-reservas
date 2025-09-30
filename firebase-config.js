// Configuración de Firebase para Succot Avivia 2025
const firebaseConfig = {
  apiKey: "AIzaSyALiF3VUCvhSJDov-q4t0akX4_SxogkSkQ",
  authDomain: "sucot-avivia-2025.firebaseapp.com",
  databaseURL: "https://sucot-avivia-2025-default-rtdb.firebaseio.com",
  projectId: "sucot-avivia-2025",
  storageBucket: "sucot-avivia-2025.firebasestorage.app",
  messagingSenderId: "616142433171",
  appId: "1:616142433171:web:35a6eaf7b0d3da44d09666"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencia a la base de datos
const database = firebase.database();
const reservationsRef = database.ref('reservations');
