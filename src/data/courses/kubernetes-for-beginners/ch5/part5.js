export default {
  es: `
      <p>En la <a href="/course/kubernetes-for-beginners/configmaps-secrets/volumenes-vs-env">sub-parte anterior</a> vimos qué pasa <em>técnicamente</em> cuando un ConfigMap o Secret cambia: env vars no se actualizan, volúmenes sí pero la app tiene que saber recargar. Acá vamos al lado operacional: <strong>cómo se rotan estos objetos en la vida real</strong> sin que un cambio menor te tire un servicio.</p>

      <h2>El problema en producción</h2>

      <p>Tres flujos típicos donde el "ConfigMap cambió pero los Pods no":</p>

      <ol>
        <li>Alguien sube un cambio al ConfigMap por GitOps. Argo CD lo aplica. Los Pods siguen con la config vieja porque no se reiniciaron. Nadie se entera hasta que un debug muestra valores raros.</li>
        <li>Rotas un Secret (ej. credenciales de DB). Los Pods siguen autenticando con el viejo. La rotación es <em>solo a medias</em> hasta que reinicies.</li>
        <li>Modificas <code>config.yaml</code> montado como volumen. El archivo se actualiza, pero la app no relee — sigue con la copia en memoria.</li>
      </ol>

      <p>La solución no es una sola — depende de qué tipo de cambio y qué tipo de app.</p>

      <h2>Estrategia 1: rollout restart explícito</h2>

      <pre><code>kubectl rollout restart deployment/web</code></pre>

      <p>El comando más directo. Añade una annotation con timestamp al template, lo cual cuenta como "template cambió" para el Deployment, y dispara un rolling update. Los Pods nuevos toman la config nueva al arrancar.</p>

      <p>Es lo que vas a hacer la mayoría de las veces. Funciona para env vars, volúmenes, y Secrets. La única consideración: respeta <code>maxSurge</code> y <code>maxUnavailable</code>, así que la rotación es gradual.</p>

      <h2>Estrategia 2: hash del config en el template</h2>

      <p>Lo automatizado. Cada vez que aplicas, generas un hash del ConfigMap/Secret y lo metes como annotation del template:</p>

      <pre><code>spec:
  template:
    metadata:
      annotations:
        config-checksum: "sha256:&lt;hash&gt;"</code></pre>

      <p>Helm lo hace con <code>{{ include "myapp.config" . | sha256sum }}</code>. Kustomize lo hace solo con <code>configMapGenerator</code> (genera un sufijo de hash en el nombre y referencia el nombre nuevo en los Pods). Argo CD respeta cualquiera de los dos.</p>

      <p>Beneficio: no hay un paso extra ni intervención humana. Cada cambio del ConfigMap fuerza naturalmente un rollout.</p>

      <h2>Estrategia 3: Reloader</h2>

      <p><a href="https://github.com/stakater/Reloader" target="_blank" rel="noopener noreferrer">Reloader</a> es un controller que vigila ConfigMaps y Secrets y dispara <code>rollout restart</code> automáticamente cuando cambian, basado en una annotation:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
spec:
  ...</code></pre>

      <p>Útil cuando no usas un sistema de templates que maneje el hash automáticamente. Una sola anotación y olvidás del problema.</p>

      <h2>Estrategia 4: Immutable + sufijo de hash</h2>

      <p>El patrón más limpio para entornos GitOps grandes. Marcas tus ConfigMaps como <code>immutable: true</code> y nombras cada versión con un sufijo de hash:</p>

      <pre><code>name: app-config-7c9f8c4d
name: app-config-9b8a7e6f   # nueva versión, nuevo objeto</code></pre>

      <p>Cada cambio crea un objeto nuevo. El Deployment apunta al nuevo nombre, lo cual obviamente es un cambio de template, y se dispara el rollout. El ConfigMap viejo se queda hasta que limpies (o lo limpia kustomize/Argo CD por ti).</p>

      <p>La ventaja sobre el hash en annotation: el rollback se vuelve trivial. Apuntas al ConfigMap viejo y los Pods vuelven a montar el archivo viejo.</p>

      <h2>Reload sin reinicio (apps que saben recargar)</h2>

      <p>Para apps que pueden recargar config sin reiniciar (nginx, prometheus, envoy, fluent-bit):</p>

      <ol>
        <li>El ConfigMap se monta como volumen.</li>
        <li>Cuando kubelet propaga el cambio (típicamente &lt; 60s), el archivo se actualiza.</li>
        <li>Algo dispara la recarga. Opciones: un sidecar que vigila el archivo y manda <code>SIGHUP</code> al proceso principal, o un endpoint HTTP de la app (<code>POST /-/reload</code>).</li>
      </ol>

      <p>Este patrón es común en stacks de observability donde querés cambiar reglas de Prometheus, dashboards o pipelines de logs sin tirar el servicio.</p>

      <h2>Rotación de Secrets en serio</h2>

      <p>Los Secrets nativos de Kubernetes no rotan solos. Si tu provider de identidad (AWS IAM, GCP IAM, Vault) emite credenciales con vencimiento, hay tres caminos:</p>

      <ul>
        <li><strong>External Secrets Operator</strong>: vigila un secret manager externo (Vault, AWS Secrets Manager, etc.) y materializa los Secrets de Kubernetes con su contenido, refrescando periódicamente. Lo vemos en la siguiente sub-parte.</li>
        <li><strong>cert-manager</strong>: rota certificados automáticamente y actualiza el Secret <code>kubernetes.io/tls</code> antes de que expiren.</li>
        <li><strong>CSI driver de Secrets</strong>: monta secretos directamente desde un secret manager externo, sin pasar por etcd. Más complejo pero el más seguro.</li>
      </ul>

      <h2>Para la KCNA</h2>

      <ul>
        <li><code>kubectl rollout restart deployment/X</code> es el reinicio explícito que lleva la config nueva.</li>
        <li>Hash del config en annotation o sufijo de hash en el nombre + <code>immutable: true</code> son los patrones GitOps comunes.</li>
        <li>Reloader es el add-on que automatiza el restart cuando un ConfigMap/Secret cambia.</li>
        <li>Apps que saben recargar (nginx, prometheus) pueden tomar config nueva sin reinicio si la montas como volumen.</li>
        <li>Para rotación seria de credenciales, los Secrets nativos no alcanzan — hace falta una herramienta externa.</li>
      </ul>

      <p>Cerramos en la siguiente sub-parte con esos límites del modelo y las herramientas más usadas: external-secrets, sealed-secrets, Vault, y por qué nadie con un cluster medianamente serio se queda solo con Secrets nativos.</p>
    `,
  en: `
      <p>In the <a href="/course/kubernetes-for-beginners/configmaps-secrets/volumenes-vs-env">previous sub-part</a> we saw what happens <em>technically</em> when a ConfigMap or Secret changes: env vars don't update, volumes do but the app has to know how to reload. Now to the operational side: <strong>how these objects get rotated in real life</strong> without a minor change taking down a service.</p>

      <h2>The production problem</h2>

      <p>Three typical "ConfigMap changed but Pods didn't" flows:</p>

      <ol>
        <li>Someone pushes a ConfigMap change via GitOps. Argo CD applies it. Pods keep the old config because they didn't restart. Nobody notices until debugging shows weird values.</li>
        <li>You rotate a Secret (e.g. DB credentials). Pods keep authenticating with the old one. The rotation is <em>only halfway</em> until you restart.</li>
        <li>You change <code>config.yaml</code> mounted as a volume. The file updates, but the app doesn't reread — keeps the in-memory copy.</li>
      </ol>

      <p>There's no single fix — it depends on what kind of change and what kind of app.</p>

      <h2>Strategy 1: explicit rollout restart</h2>

      <pre><code>kubectl rollout restart deployment/web</code></pre>

      <p>The most direct command. Adds a timestamped annotation to the template, which counts as "template changed" for the Deployment and triggers a rolling update. New Pods pick up the new config at startup.</p>

      <p>This is what you'll do most of the time. Works for env vars, volumes, and Secrets. Only consideration: it respects <code>maxSurge</code> and <code>maxUnavailable</code>, so the rotation is gradual.</p>

      <h2>Strategy 2: config hash in the template</h2>

      <p>The automated version. Each apply generates a hash of the ConfigMap/Secret and stores it as a template annotation:</p>

      <pre><code>spec:
  template:
    metadata:
      annotations:
        config-checksum: "sha256:&lt;hash&gt;"</code></pre>

      <p>Helm does it with <code>{{ include "myapp.config" . | sha256sum }}</code>. Kustomize does it on its own with <code>configMapGenerator</code> (generates a hash suffix in the name and references the new name in Pods). Argo CD respects either.</p>

      <p>Benefit: no extra step, no human intervention. Each ConfigMap change naturally forces a rollout.</p>

      <h2>Strategy 3: Reloader</h2>

      <p><a href="https://github.com/stakater/Reloader" target="_blank" rel="noopener noreferrer">Reloader</a> is a controller that watches ConfigMaps and Secrets and triggers <code>rollout restart</code> automatically when they change, based on an annotation:</p>

      <pre><code>apiVersion: apps/v1
kind: Deployment
metadata:
  annotations:
    reloader.stakater.com/auto: "true"
spec:
  ...</code></pre>

      <p>Useful when you're not using a templating system that handles the hash automatically. One annotation and you forget about the problem.</p>

      <h2>Strategy 4: Immutable + hash suffix</h2>

      <p>The cleanest pattern for big GitOps environments. Mark your ConfigMaps as <code>immutable: true</code> and name each version with a hash suffix:</p>

      <pre><code>name: app-config-7c9f8c4d
name: app-config-9b8a7e6f   # new version, new object</code></pre>

      <p>Each change creates a new object. The Deployment points to the new name, which is obviously a template change, so the rollout fires. The old ConfigMap stays until you clean it up (or kustomize/Argo CD does it for you).</p>

      <p>Advantage over annotation hash: rollback becomes trivial. Point at the old ConfigMap and the Pods remount the old file.</p>

      <h2>Reload without restart (apps that can)</h2>

      <p>For apps that can reload config without restarting (nginx, prometheus, envoy, fluent-bit):</p>

      <ol>
        <li>Mount the ConfigMap as a volume.</li>
        <li>When kubelet propagates the change (typically &lt; 60s), the file updates.</li>
        <li>Something triggers the reload. Options: a sidecar that watches the file and sends <code>SIGHUP</code> to the main process, or an HTTP endpoint on the app (<code>POST /-/reload</code>).</li>
      </ol>

      <p>This pattern is common in observability stacks where you want to change Prometheus rules, dashboards, or log pipelines without bouncing the service.</p>

      <h2>Real Secret rotation</h2>

      <p>Native Kubernetes Secrets don't rotate themselves. If your identity provider (AWS IAM, GCP IAM, Vault) issues credentials with expiration, there are three paths:</p>

      <ul>
        <li><strong>External Secrets Operator</strong>: watches an external secret manager (Vault, AWS Secrets Manager, etc.) and materializes Kubernetes Secrets with the content, refreshing periodically. Covered in the next sub-part.</li>
        <li><strong>cert-manager</strong>: rotates certificates automatically and updates the <code>kubernetes.io/tls</code> Secret before they expire.</li>
        <li><strong>Secrets CSI driver</strong>: mounts secrets directly from an external secret manager, bypassing etcd. More complex but most secure.</li>
      </ul>

      <h2>For the KCNA</h2>

      <ul>
        <li><code>kubectl rollout restart deployment/X</code> is the explicit restart that picks up the new config.</li>
        <li>Config hash in an annotation or hash suffix on the name + <code>immutable: true</code> are the common GitOps patterns.</li>
        <li>Reloader is the add-on that automates the restart when a ConfigMap/Secret changes.</li>
        <li>Apps that can reload (nginx, prometheus) can take new config without a restart if you mount it as a volume.</li>
        <li>For serious credential rotation, native Secrets aren't enough — you need external tooling.</li>
      </ul>

      <p>We close in the next sub-part with the model's limits and the most-used tools: external-secrets, sealed-secrets, Vault, and why anyone with a half-serious cluster doesn't stop at native Secrets.</p>
    `,
};
