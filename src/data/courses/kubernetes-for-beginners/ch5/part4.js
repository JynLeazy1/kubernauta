export default {
  es: `
      <p>Las dos sub-partes anteriores mencionaron las tres formas de inyectar configuración: env vars individuales, <code>envFrom</code>, o volumen. La pregunta práctica es <em>cuál usar cuándo</em>. La respuesta corta tiene tres reglas; la larga tiene matices.</p>

      <h2>Cuándo env vars</h2>

      <p>Las env vars son la forma natural cuando:</p>

      <ul>
        <li>El valor es <strong>escalar</strong>: una URL, un número, un flag.</li>
        <li>La app espera leer del entorno (es la forma 12-factor).</li>
        <li>Hay <strong>pocos valores</strong> (digamos, menos de 15).</li>
        <li>El valor casi <em>nunca</em> cambia. Si cambia, vas a necesitar un rollout para que tome efecto.</li>
      </ul>

      <p>Para ConfigMaps no sensibles, env vars está bien. Para Secrets, env vars tiene riesgos: aparecen en <code>ps aux</code>, en variables expuestas a otros procesos del Pod, en volcados de error si tu app las imprime al loguear. Mejor volumen.</p>

      <h2>Cuándo volumen</h2>

      <p>El volumen es preferible cuando:</p>

      <ul>
        <li>El valor es un <strong>archivo de configuración</strong>: nginx.conf, prometheus.yml, certificados.</li>
        <li>El valor cambia con frecuencia y la app sabe recargar (vía signal o file watch).</li>
        <li>Es un Secret.</li>
        <li>Hay muchas claves y meterlas todas como env vars contamina el entorno.</li>
      </ul>

      <p>Detalle: los archivos de un volumen <code>configMap</code> o <code>secret</code> son <em>symlinks</em> a un directorio gestionado por kubelet. Cuando el ConfigMap/Secret se actualiza, kubelet rota el directorio y el symlink apunta al nuevo. La app puede detectar el cambio con un <code>fsnotify</code> o re-leyendo el archivo periódicamente.</p>

      <h2>Qué pasa cuando un ConfigMap o Secret cambia</h2>

      <p>Acá viene una asimetría importante:</p>

      <h3>Si el valor está como env var</h3>

      <p><strong>No pasa nada.</strong> Las env vars de un proceso se setean al arranque y son inmutables hasta que el proceso reinicia. Cambiar el ConfigMap no actualiza las env vars de los Pods que ya corren. Para que tomen el cambio, hay que rotar los Pods (un <code>kubectl rollout restart deployment/X</code>).</p>

      <h3>Si el valor está como archivo en volumen</h3>

      <p><strong>El archivo se actualiza solo</strong>, normalmente en menos de un minuto. Pero ojo: <em>el proceso dentro del contenedor sigue teniendo abierto el archivo viejo</em>. Para que tome efecto:</p>

      <ul>
        <li>La app tiene que volver a abrir el archivo (re-read on signal, file watch).</li>
        <li>O bien reiniciar el contenedor.</li>
      </ul>

      <p>Tres apps comunes que sí saben recargar: nginx (<code>kill -HUP</code>), prometheus (<code>kill -HUP</code> o el endpoint <code>/-/reload</code>), envoy (xDS). Muchas otras no.</p>

      <h3>Si el ConfigMap es <code>immutable: true</code></h3>

      <p>No se puede modificar. Hay que borrar y recrear, lo cual es inevitablemente disruptivo — pero es justo lo que querías al marcarlo como inmutable.</p>

      <h2>El truco del hash en Deployment annotations</h2>

      <p>Para forzar un rolling update cuando cambias un ConfigMap o Secret, el patrón común es meter un hash de su contenido como annotation del Pod template. Cuando el contenido cambia, el hash cambia, y el Deployment ve un template "nuevo" y dispara rollout:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      annotations:
        config-hash: "&lt;sha256 del ConfigMap&gt;"
    spec:
      containers:
        - name: app
          envFrom:
            - configMapRef:
                name: app-config</code></pre>

      <p>Helm, kustomize y Argo CD pueden generar ese hash automáticamente. Si lo haces a mano, lo más cómodo es <code>kubectl rollout restart deployment/X</code>, que añade una annotation con timestamp y dispara el rollout sin tocar el spec.</p>

      <h2>Reloader: la solución dedicada</h2>

      <p>Existe un controller llamado <a href="https://github.com/stakater/Reloader" target="_blank" rel="noopener noreferrer">Reloader</a> que vigila ConfigMaps y Secrets y dispara <code>rollout restart</code> automáticamente cuando cambian. Es de los add-ons más usados en clusters reales.</p>

      <h2>Inmutabilidad como política</h2>

      <p>En entornos GitOps con muchos cambios, marcar ConfigMaps y Secrets como <code>immutable: true</code> y rotarlos creando uno nuevo (con sufijo de hash en el nombre) es una práctica recomendada:</p>

      <pre><code>name: app-config-a3f5d72</code></pre>

      <p>Cada cambio crea un objeto nuevo; los Pods que lo referencian se recrean con el nombre nuevo en su spec. Es lo que hace kustomize por defecto con su <code>configMapGenerator</code>.</p>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Env vars escalares y pocas → forma <code>env</code> o <code>envFrom</code>.</li>
        <li>Archivos de config y Secrets → forma volumen, montados <code>readOnly</code>.</li>
        <li>Cambiar un ConfigMap/Secret <strong>no</strong> rota los Pods — env vars no se actualizan en runtime.</li>
        <li>Volúmenes <em>sí</em> reflejan los cambios (con delay), pero la app tiene que saber recargar.</li>
        <li><code>kubectl rollout restart deployment/X</code> es la forma oficial de "reiniciar para tomar config nueva".</li>
        <li>Para producción seria, considerar Reloader o ConfigMaps inmutables con sufijo de hash.</li>
      </ul>

      <p>En la siguiente sub-parte cerramos el capítulo con los límites reales del modelo y las herramientas que la mayoría de los equipos terminan usando además de los Secrets nativos: external-secrets, sealed-secrets, integraciones con Vault y KMS.</p>
    `,
  en: `
      <p>The previous two sub-parts mentioned the three injection forms: individual env vars, <code>envFrom</code>, or volume. The practical question is <em>which to use when</em>. The short answer has three rules; the long one has nuances.</p>

      <h2>When env vars</h2>

      <p>Env vars are the natural form when:</p>

      <ul>
        <li>The value is <strong>scalar</strong>: a URL, a number, a flag.</li>
        <li>The app expects to read from the environment (12-factor style).</li>
        <li>There are <strong>few values</strong> (say, fewer than 15).</li>
        <li>The value almost <em>never</em> changes. If it does, you'll need a rollout for it to take effect.</li>
      </ul>

      <p>For non-sensitive ConfigMaps, env vars are fine. For Secrets, env vars are risky: they show up in <code>ps aux</code>, in vars exposed to other processes in the Pod, in error dumps if your app prints them when logging. Volume is better.</p>

      <h2>When volume</h2>

      <p>Volume is preferable when:</p>

      <ul>
        <li>The value is a <strong>config file</strong>: nginx.conf, prometheus.yml, certificates.</li>
        <li>The value changes frequently and the app knows how to reload (via signal or file watch).</li>
        <li>It's a Secret.</li>
        <li>There are many keys and dumping them all as env vars pollutes the environment.</li>
      </ul>

      <p>Detail: files in a <code>configMap</code> or <code>secret</code> volume are <em>symlinks</em> to a directory managed by kubelet. When the ConfigMap/Secret is updated, kubelet rotates the directory and the symlink points to the new one. The app can detect the change with <code>fsnotify</code> or by re-reading the file periodically.</p>

      <h2>What happens when a ConfigMap or Secret changes</h2>

      <p>Here comes an important asymmetry:</p>

      <h3>If the value is an env var</h3>

      <p><strong>Nothing happens.</strong> A process's env vars are set at startup and immutable until the process restarts. Changing the ConfigMap doesn't update env vars on running Pods. For them to pick up the change, you have to rotate the Pods (a <code>kubectl rollout restart deployment/X</code>).</p>

      <h3>If the value is a file in a volume</h3>

      <p><strong>The file updates by itself</strong>, usually in under a minute. But careful: <em>the process inside the container still has the old file open</em>. For it to take effect:</p>

      <ul>
        <li>The app has to reopen the file (reread on signal, file watch).</li>
        <li>Or restart the container.</li>
      </ul>

      <p>Three common apps that do know how to reload: nginx (<code>kill -HUP</code>), prometheus (<code>kill -HUP</code> or the <code>/-/reload</code> endpoint), envoy (xDS). Many others don't.</p>

      <h3>If the ConfigMap is <code>immutable: true</code></h3>

      <p>It can't be modified. You have to delete and recreate, which is inevitably disruptive — but that's exactly what you wanted by marking it immutable.</p>

      <h2>The hash-in-Deployment-annotation trick</h2>

      <p>To force a rolling update when you change a ConfigMap or Secret, the common pattern is to put a hash of its content as an annotation on the Pod template. When the content changes, the hash changes, and the Deployment sees a "new" template and triggers a rollout:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
spec:
  template:
    metadata:
      annotations:
        config-hash: "&lt;sha256 of the ConfigMap&gt;"
    spec:
      containers:
        - name: app
          envFrom:
            - configMapRef:
                name: app-config</code></pre>

      <p>Helm, kustomize, and Argo CD can generate that hash automatically. If you do it by hand, the easiest is <code>kubectl rollout restart deployment/X</code>, which adds a timestamp annotation and triggers the rollout without touching the spec.</p>

      <h2>Reloader: the dedicated solution</h2>

      <p>There's a controller called <a href="https://github.com/stakater/Reloader" target="_blank" rel="noopener noreferrer">Reloader</a> that watches ConfigMaps and Secrets and automatically triggers <code>rollout restart</code> when they change. One of the most-used add-ons in real clusters.</p>

      <h2>Immutability as policy</h2>

      <p>In GitOps environments with many changes, marking ConfigMaps and Secrets as <code>immutable: true</code> and rotating them by creating a new one (with a hash suffix in the name) is a recommended practice:</p>

      <pre><code>name: app-config-a3f5d72</code></pre>

      <p>Each change creates a new object; Pods that reference it are recreated with the new name in their spec. That's what kustomize does by default with its <code>configMapGenerator</code>.</p>

      <h2>For the KCNA</h2>

      <ul>
        <li>Scalar env vars and few of them → <code>env</code> or <code>envFrom</code>.</li>
        <li>Config files and Secrets → volume, mounted <code>readOnly</code>.</li>
        <li>Changing a ConfigMap/Secret does <strong>not</strong> rotate Pods — env vars don't update at runtime.</li>
        <li>Volumes <em>do</em> reflect changes (with delay), but the app has to know how to reload.</li>
        <li><code>kubectl rollout restart deployment/X</code> is the official way to "restart to pick up new config".</li>
        <li>For serious production, consider Reloader or immutable ConfigMaps with hash suffixes.</li>
      </ul>

      <p>In the next sub-part we close the chapter with the model's real limits and the tools most teams end up using on top of native Secrets: external-secrets, sealed-secrets, Vault, and KMS integrations.</p>
    `,
}
