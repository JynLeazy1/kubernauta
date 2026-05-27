export default {
  es: `
      <p>El <code>ConfigMap</code> es el objeto más simple del capítulo: un mapa de claves a valores que vive en el cluster. Cualquier Pod del mismo namespace puede leerlo.</p>

      <h2>Crear un ConfigMap</h2>

      <p>Hay tres formas según de dónde vengan los datos:</p>

      <h3>Desde literales</h3>

      <pre><code>kubectl create configmap app-config \\
  --from-literal=LOG_LEVEL=info \\
  --from-literal=CACHE_SIZE=128</code></pre>

      <p>Útil para experimentos o pequeños sets. Cada <code>--from-literal</code> añade una clave.</p>

      <h3>Desde un archivo</h3>

      <pre><code>kubectl create configmap nginx-config \\
  --from-file=nginx.conf=./nginx.conf</code></pre>

      <p>Crea una clave llamada <code>nginx.conf</code> con el contenido del archivo. Sin el <code>=</code>, kubectl usa el nombre del archivo como clave.</p>

      <h3>Desde un directorio</h3>

      <pre><code>kubectl create configmap site-config \\
  --from-file=./conf.d/</code></pre>

      <p>Toma cada archivo del directorio y lo agrega como clave del ConfigMap.</p>

      <h3>Desde YAML (la forma declarativa)</h3>

      <p>La que vas a usar en producción y en GitOps:</p>

      <pre><code>apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: info
  CACHE_SIZE: "128"
  config.yaml: |
    server:
      port: 8080
      timeout: 30s</code></pre>

      <p>Detalles:</p>

      <ul>
        <li>Los valores numéricos van entre comillas — <code>data</code> espera strings.</li>
        <li>Los valores multilínea se escriben con <code>|</code> (preserva saltos de línea) o <code>&gt;</code> (los pliega).</li>
        <li>Existe también <code>binaryData</code> para contenido binario en base64. Casi nunca se usa para configuración.</li>
      </ul>

      <h2>Consumirlo desde un Pod</h2>

      <p>Tres formas, según cómo le pasas los valores al contenedor:</p>

      <h3>1. Como variables de entorno individuales</h3>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL</code></pre>

      <p>Esta forma deja explícito qué clave del ConfigMap mapea a qué env var. Sirve cuando los nombres no coinciden o cuando solo quieres algunas claves.</p>

      <h3>2. Todas las claves como env vars con <code>envFrom</code></h3>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      envFrom:
        - configMapRef:
            name: app-config</code></pre>

      <p>Levanta cada clave del ConfigMap como una env var con el mismo nombre. Más conciso, pero hace ruido si el ConfigMap tiene muchas claves o nombres no aptos para env (los inválidos se omiten con un warning).</p>

      <h3>3. Como archivos en un volumen</h3>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: config
          mountPath: /etc/myapp
  volumes:
    - name: config
      configMap:
        name: app-config</code></pre>

      <p>Cada clave del ConfigMap se convierte en un archivo dentro de <code>/etc/myapp</code>. El valor es el contenido del archivo. Es la forma natural cuando tu app espera un archivo de configuración (nginx, prometheus, redis).</p>

      <p>Detalle útil: con <code>items</code> puedes elegir qué claves montar y bajo qué nombre:</p>

      <pre><code>volumes:
  - name: config
    configMap:
      name: app-config
      items:
        - key: config.yaml
          path: app.yml</code></pre>

      <h2>Cuándo env vs volumen</h2>

      <p>Una guía rápida:</p>

      <ul>
        <li><strong>env vars</strong>: pocos valores escalares. La app espera leer del entorno (12-factor).</li>
        <li><strong>volumen</strong>: archivos de configuración complejos, multilínea, que la app espera por path.</li>
      </ul>

      <p>No mezcles. Si tu app lee un archivo de config, no la fuerces a leer 50 env vars.</p>

      <h2>Inmutabilidad opcional</h2>

      <p>Desde la 1.21 puedes marcar un ConfigMap como inmutable:</p>

      <pre><code>apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
immutable: true
data:
  LOG_LEVEL: info</code></pre>

      <p>Una vez creado, ya no se puede modificar — solo borrar y recrear. Reduce carga sobre el apiserver porque kubelet ya no necesita vigilarlo. Recomendado para configs que de hecho no cambian.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>ConfigMap vive en <code>v1</code> (grupo core).</li>
        <li>Se crea con <code>kubectl create configmap</code> o YAML declarativo.</li>
        <li>Se consume como env vars individuales (<code>configMapKeyRef</code>), todas a la vez (<code>envFrom</code>), o como archivos en un volumen.</li>
        <li>El campo <code>immutable: true</code> bloquea modificaciones futuras.</li>
        <li>Tamaño máximo: 1 MiB.</li>
      </ul>

      <p>En la siguiente sub-parte abrimos el primo sensible: el Secret. Veremos los tipos built-in, qué significa "base64 no es cifrado", y cómo activar encryption at rest en etcd.</p>
    `,
  en: `
      <p><code>ConfigMap</code> is the simplest object in the chapter: a key-value map that lives in the cluster. Any Pod in the same namespace can read it.</p>

      <h2>Creating a ConfigMap</h2>

      <p>Three ways depending on where the data comes from:</p>

      <h3>From literals</h3>

      <pre><code>kubectl create configmap app-config \\
  --from-literal=LOG_LEVEL=info \\
  --from-literal=CACHE_SIZE=128</code></pre>

      <p>Useful for experiments or small sets. Each <code>--from-literal</code> adds one key.</p>

      <h3>From a file</h3>

      <pre><code>kubectl create configmap nginx-config \\
  --from-file=nginx.conf=./nginx.conf</code></pre>

      <p>Creates a key named <code>nginx.conf</code> with the file's content. Without the <code>=</code>, kubectl uses the filename as the key.</p>

      <h3>From a directory</h3>

      <pre><code>kubectl create configmap site-config \\
  --from-file=./conf.d/</code></pre>

      <p>Takes each file in the directory and adds it as a key.</p>

      <h3>From YAML (the declarative way)</h3>

      <p>The one you'll use in production and GitOps:</p>

      <pre><code>apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  LOG_LEVEL: info
  CACHE_SIZE: "128"
  config.yaml: |
    server:
      port: 8080
      timeout: 30s</code></pre>

      <p>Details:</p>

      <ul>
        <li>Numeric values go in quotes — <code>data</code> expects strings.</li>
        <li>Multi-line values use <code>|</code> (preserves newlines) or <code>&gt;</code> (folds them).</li>
        <li><code>binaryData</code> exists for binary content in base64. Almost never used for configuration.</li>
      </ul>

      <h2>Consuming it from a Pod</h2>

      <p>Three ways, depending on how you pass values to the container:</p>

      <h3>1. As individual environment variables</h3>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: LOG_LEVEL</code></pre>

      <p>This form makes it explicit which ConfigMap key maps to which env var. Use it when names don't match or when you only want a subset.</p>

      <h3>2. All keys as env vars with <code>envFrom</code></h3>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      envFrom:
        - configMapRef:
            name: app-config</code></pre>

      <p>Promotes every key to an env var with the same name. More concise, but noisy if the ConfigMap has many keys or invalid names (invalid ones are skipped with a warning).</p>

      <h3>3. As files in a volume</h3>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: config
          mountPath: /etc/myapp
  volumes:
    - name: config
      configMap:
        name: app-config</code></pre>

      <p>Each ConfigMap key becomes a file under <code>/etc/myapp</code>. The value is the file's content. The natural form when your app expects a config file (nginx, prometheus, redis).</p>

      <p>Useful detail: with <code>items</code> you can pick which keys to mount and under what name:</p>

      <pre><code>volumes:
  - name: config
    configMap:
      name: app-config
      items:
        - key: config.yaml
          path: app.yml</code></pre>

      <h2>When env vs volume</h2>

      <p>Quick guide:</p>

      <ul>
        <li><strong>env vars</strong>: few scalar values. The app expects to read from the environment (12-factor).</li>
        <li><strong>volume</strong>: complex multi-line config files the app expects by path.</li>
      </ul>

      <p>Don't mix. If your app reads a config file, don't force it to read 50 env vars.</p>

      <h2>Optional immutability</h2>

      <p>Since 1.21 you can mark a ConfigMap immutable:</p>

      <pre><code>apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
immutable: true
data:
  LOG_LEVEL: info</code></pre>

      <p>Once created, it can no longer be modified — only deleted and recreated. Reduces apiserver load because kubelet no longer needs to watch it. Recommended for configs that genuinely don't change.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>ConfigMap lives in <code>v1</code> (core group).</li>
        <li>Created with <code>kubectl create configmap</code> or declarative YAML.</li>
        <li>Consumed as individual env vars (<code>configMapKeyRef</code>), all at once (<code>envFrom</code>), or as files in a volume.</li>
        <li>The <code>immutable: true</code> field blocks future modifications.</li>
        <li>Max size: 1 MiB.</li>
      </ul>

      <p>In the next sub-part we open the sensitive cousin: the Secret. We'll see the built-in types, what "base64 is not encryption" means, and how to turn on encryption at rest in etcd.</p>
    `,
};
