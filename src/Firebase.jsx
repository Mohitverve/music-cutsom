// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// Replace the below config with your Firebase project's configuration
const firebaseConfig = {
    apiKey: "AIzaSyCnICYV0D8ZNQkEa5uSygm0sfvZ9bO2qow",
    authDomain: "date-planner-6a634.firebaseapp.com",
    projectId: "date-planner-6a634",
    storageBucket: "date-planner-6a634.firebasestorage.app",
    messagingSenderId: "26784930092",
    appId: "1:26784930092:web:4c54373d0a081e418a3489",
    measurementId: "G-V60RT941GP"
  };
  
const app = initializeApp(firebaseConfig);
export const storage = getStorage(app);
export const firestore = getFirestore(app);
