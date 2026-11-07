# Guía Paso a Paso de Configuración de Servicios y Herramientas (`HealthyCropping`)

Esta guía explica desde cero, paso a paso y con los nombres exactos de cada menú, cómo instalar las herramientas locales y configurar todos los servicios gratuitos necesarios para desarrollar, entrenar, desplegar y compilar **HealthyCropping** (`com.keylorpineda.healthycroppingping`).

> [!CAUTION]
> **Regla de oro de seguridad**: Nunca subas a Git archivos `.env`, `service-account.json`, `google-services.json`, `kaggle.json` ni llaves de firma (`.jks` / `.keystore`). Todos están ignorados en `.gitignore`.

---

## Resumen Rápido: ¿Qué variable va en cada archivo `.env`?

Antes de empezar, copia las plantillas en tu entorno local:
```powershell
Copy-Item api/.env.example api/.env
Copy-Item app/.env.example app/.env
```

| Servicio | Variable / Archivo | Destino | Descripción |
| :--- | :--- | :--- | :--- |
| **Firebase Admin** | `FIREBASE_PROJECT_ID` | `api/.env` | ID del proyecto en Firebase (ej. `healthycropping-cr`) |
| **Firebase Admin** | `GOOGLE_APPLICATION_CREDENTIALS` | `api/.env` | Ruta local al JSON de cuenta de servicio (`./service-account.json`) |
| **Firebase Android** | `google-services.json` | `app/google-services.json` | Archivo de configuración Android descargado de Firebase |
| **Firebase Auth (App)** | `EXPO_PUBLIC_FIREBASE_API_KEY` (y demás `EXPO_PUBLIC_FIREBASE_*`) | `app/.env` | Credenciales públicas del cliente Firebase para iniciar sesión |
| **Google AI Studio** | `GEMINI_API_KEY` | `api/.env` | Clave de API de Gemini (nivel gratuito) |
| **Google AI Studio** | `GEMINI_MODEL` | `api/.env` | Modelo Flash gratuito (ej. `gemini-2.5-flash`) |
| **Cloudinary** | `CLOUDINARY_CLOUD_NAME` | `api/.env` | Nombre de tu nube en Cloudinary |
| **Cloudinary** | `CLOUDINARY_API_KEY` | `api/.env` | API Key de Cloudinary |
| **Cloudinary** | `CLOUDINARY_API_SECRET` | `api/.env` | API Secret de Cloudinary (**solo en `api/.env`**, nunca en `app/.env`) |
| **Cloudinary (App)** | `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | `app/.env` | Mismo `Cloud Name` público para subir fotos firmadas |
| **Backend URL (App)** | `EXPO_PUBLIC_API_URL` | `app/.env` | URL de tu API (`http://10.0.2.2:8000` en emulador, IP LAN en teléfono, o URL `https://...onrender.com` en producción) |
| **Kaggle** | `kaggle.json` | `~/.kaggle/kaggle.json` | Token para descargar datasets desde Kaggle (`ml/`) |

---

## 1. Herramientas Locales (`gh`, Node LTS, `pnpm`, `uv`)

### 1.1 Instalación en Windows (PowerShell)
1. **GitHub CLI (`gh`)**:
   ```powershell
   winget install --id GitHub.cli
   ```
   Para iniciar sesión en tu cuenta `keylorpineda`:
   ```powershell
   gh auth login
   ```
   - Elige: `GitHub.com` -> `HTTPS` -> `Yes` (autenticar Git con credenciales de GitHub) -> `Login with a web browser`.
   - **Cómo verificar que funciona**:
     ```powershell
     gh auth status
     ```
     Debe mostrar `✓ Logged in to github.com account keylorpineda`.

2. **Node.js LTS y `pnpm`**:
   - Instala Node.js LTS (versión `24.x`, definida en `.nvmrc`):
     ```powershell
     winget install OpenJS.NodeJS.LTS
     ```
   - Habilita o instala `pnpm` (nunca uses `npm` ni `yarn` para instalar paquetes del proyecto):
     ```powershell
     corepack enable
     corepack prepare pnpm@11.17.0 --activate
     ```
   - **Cómo verificar que funciona**:
     ```powershell
     node -v
     pnpm -v
     ```

3. **Python 3.12 con `uv`**:
   - Instala `uv`:
     ```powershell
     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
     ```
   - Instala Python 3.12 administrado por `uv`:
     ```powershell
     uv python install 3.12
     ```
   - **Cómo verificar que funciona**:
     ```powershell
     uv --version
     uv run --python 3.12 python --version
     ```
     Debe imprimir `Python 3.12.x`.

---

## 2. Firebase (Auth, Firestore, App Android y Cuenta de Servicio)

Usaremos el plan **Spark (Gratuito)** de Firebase.

### 2.1 Crear el Proyecto en Firebase
1. Entra a [https://console.firebase.google.com/](https://console.firebase.google.com/) con tu cuenta de Google.
2. Haz clic en **Create a project** (o **Agregar proyecto**).
3. Escribe el nombre del proyecto (por ejemplo, `healthycropping-cr`) y anota el **Project ID** que aparece debajo del nombre. Haz clic en **Continue**.
4. Desactiva **Enable Google Analytics for this project** (no lo necesitamos) y haz clic en **Create project**.
5. Cuando termine, haz clic en **Continue**.

### 2.2 Activar Authentication (Correo y Contraseña)
1. En el menú lateral izquierdo de Firebase Console, abre **Build** (Compilación) -> **Authentication**.
2. Haz clic en **Get started** (Comenzar).
3. Ve a la pestaña **Sign-in method** (Método de acceso).
4. En la lista de proveedores nativos, haz clic en **Email/Password** (Correo electrónico/contraseña).
5. Activa el primer interruptor **Enable** (Habilitar) — deja desactivado *Email link (passwordless sign-in)* — y haz clic en **Save** (Guardar).

### 2.3 Crear Cloud Firestore y Desplegar Reglas de Seguridad
> [!IMPORTANT]
> La aplicación Android **nunca** se conecta directamente a Firestore; todo pasa por nuestra API en FastAPI usando el SDK de administrador. Por eso las reglas de cliente deben bloquear todo acceso directo.

1. En el menú lateral izquierdo, ve a **Build** -> **Firestore Database**.
2. Haz clic en **Create database** (Crear base de datos).
3. En *Select edition*, deja **Standard** y haz clic en **Next**.
4. En *Database ID & location*, deja `(default)` y elige la región `us-east1` (South Carolina) o `nam5 (us-central)` y haz clic en **Next**.
5. Selecciona **Start in production mode** (Comenzar en modo de producción) y haz clic en **Create**.
6. Una vez creada la base de datos, haz clic en la pestaña superior **Rules** (Reglas) y reemplaza el contenido por:
   ```text
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```
7. Haz clic en el botón **Publish** (Publicar).
8. *(Opcional desde terminal)* También puedes desplegar el archivo `firestore.rules` del repositorio usando Firebase CLI (`npx firebase-tools deploy --only firestore:rules`).

### 2.4 Registrar la Aplicación Android y Obtener `google-services.json`
1. En la página principal del proyecto en Firebase (**Project Overview**), haz clic en el ícono de **Android** (el robot verde) para agregar una app.
2. Completa los campos:
   - **Android package name**: escribe exactamente `com.keylorpineda.healthycroppingping`
   - **App nickname (opcional)**: `HealthyCropping Android`
   - **Debug signing certificate SHA-1 (opcional en MVP, requerido en v1.1 para Google Sign-In)**: puedes dejarlo en blanco por ahora.
3. Haz clic en **Register app**.
4. Haz clic en **Download google-services.json** y guarda el archivo en `app/google-services.json` (no se subirá a Git).
5. Haz clic en **Next** -> **Next** -> **Continue to console**.
6. Para rellenar las variables `EXPO_PUBLIC_FIREBASE_*` en `app/.env`:
   - Haz clic en el ícono de engranaje (**⚙️ Project settings** / Configuración del proyecto) arriba a la izquierda.
   - En la pestaña **General**, baja a la sección **Your apps**.
   - Si también deseas las llaves JS para el SDK web/React Native, haz clic en **Add app** -> ícono **Web (`</>`)**, ponle `HealthyCropping Client`, haz clic en **Register app**, y copia los valores del objeto `firebaseConfig` a `app/.env`:
     ```env
     EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy...
     EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=healthycropping-cr.firebaseapp.com
     EXPO_PUBLIC_FIREBASE_PROJECT_ID=healthycropping-cr
     EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=healthycropping-cr.firebasestorage.app
     EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
     EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
     ```

### 2.5 Generar la Cuenta de Servicio (Service Account) para `api/`
1. En Firebase Console, haz clic en el ícono de engranaje (**⚙️ Project settings**) -> pestaña **Service accounts** (Cuentas de servicio).
2. Asegúrate de que esté seleccionado **Python** y haz clic en el botón azul **Generate new private key** (Generar nueva clave privada) -> **Generate key**.
3. Se descargará un archivo `.json`. Muévelo y renómbralo como `api/service-account.json`.
4. En `api/.env`, configura:
   ```env
   FIREBASE_PROJECT_ID=healthycropping-cr
   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
   ```
5. **Cómo verificar que funciona**:
   Desde la carpeta `api/`, ejecuta:
   ```powershell
   cd api
   uv run python -c "import json, pathlib; data = json.loads(pathlib.Path('service-account.json').read_text()); print('OK Project:', data['project_id'])"
   ```
   Debe imprimir `OK Project: <tu-project-id>`.

---

## 3. Clave de API de Gemini en Google AI Studio

Usaremos el nivel gratuito (**Free of charge tier**) de Google AI Studio para las explicaciones RAG en `api/`.

> [!WARNING]
> **Advertencia sobre privacidad en el nivel gratuito de Google AI Studio**: En el plan gratuito (*Free tier*) de la API de Gemini en Google AI Studio, Google puede utilizar los *prompts* y las respuestas enviadas para mejorar sus productos y entrenar modelos (a diferencia del plan de pago / Pay-as-you-go). Por esta razón, **HealthyCropping nunca envía nombres de personas, correos electrónicos, nombres de fincas ni coordenadas GPS a Gemini**; únicamente envía el nombre del cultivo, la clase de enfermedad predicha, el nivel de severidad y los fragmentos públicos de manuales técnicos (ICAFE / MAG).

### Pasos
1. Entra a [https://aistudio.google.com/](https://aistudio.google.com/) e inicia sesión con tu cuenta de Google.
2. En el menú lateral izquierdo, haz clic en **Get API key** (Obtener clave de API).
3. Haz clic en el botón **Create API key**.
4. Selecciona tu proyecto de Google Cloud/Firebase (`healthycropping-cr`) o haz clic en **Create API key in new project**, y copia la clave generada (`AIzaSy...`).
5. Abre `api/.env` y pega:
   ```env
   GEMINI_API_KEY=AIzaSyTuClaveDeGeminiAqui
   GEMINI_MODEL=gemini-2.5-flash
   ```
6. **Cómo verificar que funciona**:
   ```powershell
   curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=TU_GEMINI_API_KEY" -H "Content-Type: application/json" -X POST -d "{\"contents\":[{\"parts\":[{\"text\":\"Responde solo OK\"}]}]}"
   ```
   Debe devolver un JSON con el texto `"OK"`.

---

## 4. Registro No Comercial en Google Earth Engine (para `v1.2`)

Para el cálculo mensual de NDVI con Sentinel-2 en la versión `v1.2`, utilizamos el nivel **Noncommercial Community Tier** de Google Earth Engine.

### Pasos
1. Entra a [https://code.earthengine.google.com/register](https://code.earthengine.google.com/register).
2. Haz clic en **Register a Noncommercial or Commercial Cloud project**.
3. Selecciona **Unpaid usage** (Uso gratuito / no comercial).
4. En *Project type*, selecciona **Community / Open Source / Education / Research** y haz clic en **Next**.
5. Elige tu proyecto de Google Cloud (`healthycropping-cr`), acepta los términos y completa el registro.
6. En [Google Cloud Console -> IAM & Admin -> Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), otorga a tu cuenta de servicio el rol **Earth Engine Resource Viewer** (`roles/earthengine.viewer`) cuando comience la fase `v1.2`.
7. **Cómo verificar que funciona**:
   Abre [https://code.earthengine.google.com/](https://code.earthengine.google.com/); si carga el editor de código sin errores de permisos en tu proyecto, el registro está activo.

---

## 5. Token de API de Kaggle (`kaggle.json`)

El dataset **UNAB cocoa diseases** (`serranosebas/enfermedades-cacao-yolov4`) requiere autenticación con la API de Kaggle.

### Pasos
1. Crea una cuenta o inicia sesión en [https://www.kaggle.com/](https://www.kaggle.com/).
2. Haz clic en tu foto de perfil (esquina superior derecha) -> **Settings** (Configuración).
3. Baja hasta la sección **API** y haz clic en **Create New Token**.
4. Se descargará un archivo llamado `kaggle.json` (contiene `{"username":"...","key":"..."}`).
5. En Windows, crea la carpeta `.kaggle` en tu directorio de usuario y mueve allí el archivo:
   ```powershell
   New-Item -ItemType Directory -Force -Path "$HOME\.kaggle"
   Move-Item -Force "$HOME\Downloads\kaggle.json" "$HOME\.kaggle\kaggle.json"
   ```
   *(Recuerda: nunca copies `kaggle.json` dentro del repositorio si no está ignorado, aunque `.gitignore` ya lo bloquea por seguridad).*
6. **Cómo verificar que funciona**:
   ```powershell
   Get-Content "$HOME\.kaggle\kaggle.json"
   ```
   Verifica que tenga las claves `"username"` y `"key"`.

---

## 6. Uso de Google Colab con GPU Gratuita (`ml/`)

El entrenamiento de los modelos `MobileNetV3-Large` se realiza en **Google Colab** usando su GPU gratuita (`T4`) y tiene paridad 1 a 1 con los scripts en `ml/src/`.

### Pasos
1. Entra a [https://colab.research.google.com/](https://colab.research.google.com/).
2. Haz clic en **File** -> **Open notebook** -> pestaña **GitHub**, y abre el notebook correspondiente de `keylorpineda/healthycrop` (carpeta `ml/notebooks/`).
3. En la barra superior de menú de Colab, haz clic en **Runtime** (Entorno de ejecución) -> **Change runtime type** (Cambiar tipo de entorno de ejecución).
4. En **Hardware accelerator**, selecciona **T4 GPU** y haz clic en **Save** (Guardar).
5. **Cómo verificar que funciona**:
   Ejecuta en la primera celda del notebook:
   ```python
   import tensorflow as tf
   print("GPUs disponibles:", tf.config.list_physical_devices("GPU"))
   ```
   Debe mostrar `[PhysicalDevice(name='/physical_device:GPU:0', device_type='GPU')]`.

---

## 7. Cloudinary (Almacenamiento de Fotos en Plan Gratuito)

La API genera parámetros firmados para que la app suba fotos redimensionadas (`máx. 1280 px`) a la carpeta `users/{uid}/scans/`.

### Pasos
1. Crea una cuenta gratuita en [https://cloudinary.com/users/register_free](https://cloudinary.com/users/register_free).
2. Al entrar al panel principal (**Programmable Media Dashboard** o **Settings -> API Keys**):
   - Copia tu **Cloud name**.
   - Copia tu **API Key**.
   - Haz clic en el ícono del ojo junto a **API Secret** y cópialo.
3. En `api/.env`, pega los tres valores:
   ```env
   CLOUDINARY_CLOUD_NAME=tu_cloud_name
   CLOUDINARY_API_KEY=123456789012345
   CLOUDINARY_API_SECRET=tu_api_secret_privado
   ```
4. En `app/.env`, pega **únicamente** el nombre público de la nube:
   ```env
   EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=tu_cloud_name
   ```
5. **Cómo verificar que funciona**:
   ```powershell
   curl -u "TU_API_KEY:TU_API_SECRET" "https://api.cloudinary.com/v1_1/TU_CLOUD_NAME/ping"
   ```
   Debe responder `{"status":"ok"}`.

---

## 8. Render (Despliegue Gratuito del Backend FastAPI)

Desplegaremos `api/` como un **Web Service** gratuito en Render utilizando la especificación de infraestructura como código (*Blueprint*) definida en `render.yaml`.

> [!NOTE]
> **Comportamiento de arranque en frío (Cold Starts)**: En el plan gratuito (*Free instance*) de Render, el servidor entra en suspensión tras **15 minutos de inactividad**. La primera petición tras ese periodo tardará entre **30 y 60 segundos** mientras el contenedor despierta. Como **HealthyCropping** es *offline-first*, el diagnóstico y la gestión de fincas/lotes en el teléfono son completamente locales e instantáneos; la sincronización de la app detecta la espera y simplemente reintenta en el próximo disparador de red o reanudación de la app sin bloquear al usuario ni perder datos.

### 8.1 Despliegue con Blueprint (`render.yaml`)
1. Entra a [https://dashboard.render.com/](https://dashboard.render.com/) e inicia sesión con tu cuenta de GitHub (`keylorpineda`).
2. Haz clic en el botón **New +** (arriba a la derecha) -> **Blueprint**.
3. Conecta el repositorio de GitHub `keylorpineda/healthycropping`.
4. Render detectará automáticamente el archivo `render.yaml` en la raíz del repositorio, que define:
   - **Service Name**: `healthycropping-api`
   - **Type**: `web`
   - **Root Directory**: `api`
   - **Runtime**: `Python` (`3.12.7`)
   - **Plan**: `free`
   - **Branch**: `main` (despliegues automáticos `autoDeploy: true` únicamente al fusionar en `main`)
   - **Build Command**: `uv sync --frozen --no-dev`
   - **Start Command**: `uv run uvicorn healthycropping_api.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`

### 8.2 Configuración del Archivo Secreto (*Secret File*) de Firebase
Debido a que las credenciales de servicio nunca deben guardarse en el repositorio:
1. En el Dashboard de Render, ve a tu servicio `healthycropping-api`.
2. En el menú lateral, abre **Environment** y baja a la sección **Secret Files**.
3. Haz clic en **Add Secret File**:
   - **Filename**: `service-account.json`
   - **Contents**: copia y pega el contenido JSON completo de tu archivo local `api/service-account.json` (generado en Firebase Console según la sección 2.5).
4. El archivo se montará automáticamente en `/etc/secrets/service-account.json`, coincidiendo con la variable `GOOGLE_APPLICATION_CREDENTIALS` definida en `render.yaml`.

### 8.3 Variables de Entorno en el Dashboard (`sync: false`)
Las siguientes variables marcadas como `sync: false` en `render.yaml` deben completarse en el Dashboard de Render (**Environment** -> **Environment Variables**):
- `CORS_ORIGINS`: orígenes permitidos separados por coma (ej. `http://localhost:8081` o la URL de producción).
- `FIREBASE_PROJECT_ID`: el ID del proyecto en Firebase (ej. `healthycropping-cr`).
- `CLOUDINARY_CLOUD_NAME`: nombre de la nube de Cloudinary.
- `CLOUDINARY_API_KEY`: clave de API de Cloudinary.
- `CLOUDINARY_API_SECRET`: clave secreta de Cloudinary.

Las variables `ENV=production` y `PYTHON_VERSION=3.12.7` se aplican automáticamente desde el Blueprint.

### 8.4 Configuración de la URL de Producción en la App
1. Una vez completado el despliegue en Render, copia la URL pública generada (ej. `https://healthycropping-api.onrender.com`).
2. Configúrala en `app/.env`:
   ```env
   EXPO_PUBLIC_API_URL=https://healthycropping-api.onrender.com
   ```

### 8.5 Verificación
Realiza una petición al endpoint de salud del servicio desplegado:
```powershell
curl https://healthycropping-api.onrender.com/health
```
Debe devolver código HTTP `200` y el JSON:
```json
{"status":"ok","version":"0.1.0"}
```

---

## 9. Open-Meteo (Alertas Climáticas en `v1.1` — Uso No Comercial y Atribución)

En `v1.1` utilizamos la API meteorológica de [Open-Meteo](https://open-meteo.com/) para estimar riesgo climático conservador por lote.

- **No requiere API Key** para uso no comercial de código abierto (< 10,000 llamadas/día).
- **Requisito obligatorio de licencia (CC BY 4.0)**:
  La pantalla de mapa/alertas y la sección *Acerca de* (`About`) de la app deben incluir la atribución visible:
  > *"Weather data by Open-Meteo.com (CC BY 4.0)"* con enlace a `https://open-meteo.com/`.
- **Cómo verificar que funciona**:
  ```powershell
  curl "https://api.open-meteo.com/v1/forecast?latitude=9.93&longitude=-84.08&hourly=temperature_2m,relative_humidity_2m,precipitation"
  ```
  Debe devolver un JSON con las series horarias para San José, Costa Rica.

---

## 10. Compilación e Instalación del APK en un Teléfono Android

Debido a que **HealthyCropping** ejecuta modelos nativos TensorFlow Lite en C++/JSI (`react-native-fast-tflite`), **no puede ejecutarse dentro de Expo Go**. Se utiliza un **Development Build** durante el desarrollo y un **APK standalone** para distribución en GitHub Releases.

### 10.1 Preparar tu Teléfono Android
1. En tu teléfono Android, abre **Ajustes** (Configuración) -> **Acerca del teléfono** -> **Información de software**.
2. Toca **7 veces seguidas** sobre **Número de compilación** (*Build number*) hasta ver el mensaje *"¡Ya eres desarrollador!"*.
3. Regresa a **Ajustes** -> **Opciones de desarrollador** y activa **Depuración por USB** (*USB debugging*).
4. Conecta el teléfono a tu computadora con un cable USB de datos y acepta el aviso **Permitir depuración por USB** en la pantalla del teléfono.
5. **Cómo verificar que el teléfono está conectado**:
   ```powershell
   adb devices
   ```
   Debe aparecer el número de serie de tu teléfono seguido de la palabra `device`.

### 10.2 Opción A: Compilar e Instalar Localmente (Desarrollo con USB)
1. Asegúrate de tener instalado Android Studio (con Android SDK 34/35 y JDK 17) y `app/google-services.json` en su lugar.
2. Desde la raíz del repositorio:
   ```powershell
   pnpm install
   cd app
   pnpm expo run:android
   ```
   Esto generará el proyecto nativo Android, compilará el *Development Build* e instalará la app `HealthyCropping` directamente en tu teléfono.

### 10.3 Opción B: Compilar un APK Instalable con EAS Build (Plan Gratuito)
1. Instala EAS CLI e inicia sesión:
   ```powershell
   pnpm add -g eas-cli
   eas login
   ```
2. Dentro de `app/`, lanza una compilación con el perfil `preview` (configurado para producir un archivo `.apk` directo en lugar de `.aab`):
   ```powershell
   cd app
   eas build --platform android --profile preview
   ```
3. Cuando termine, EAS mostrará un código QR y un enlace para descargar el archivo `.apk`.

### 10.4 Cómo Instalar el APK Descargado (desde EAS o GitHub Releases)
- **Desde el teléfono**:
  1. Abre la página de [GitHub Releases de `keylorpineda/healthycrop`](https://github.com/keylorpineda/healthycrop/releases) en el navegador del teléfono.
  2. Descarga el archivo `healthycropping-vX.Y.Z.apk`.
  3. Al abrirlo, si Android solicita permiso, activa **Permitir desde esta fuente** (*Install unknown apps*) y pulsa **Instalar**.
- **Desde la computadora por USB (`adb`)**:
  ```powershell
  adb install -r healthycropping-v1.0.0.apk
  ```
  - **Cómo verificar que funciona**: Pon tu teléfono en **Modo Avión**, abre **HealthyCropping**, completa las 3 pantallas de introducción con el aviso agronómico, selecciona **Café**, y realiza un escaneo sin conexión.
