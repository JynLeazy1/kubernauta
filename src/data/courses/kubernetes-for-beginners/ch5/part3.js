export default {
  es: `
      <p>El <code>Secret</code> es el primo del ConfigMap pensado para datos sensibles: tokens, contraseñas, certificados. La sintaxis y formas de consumo son casi idénticas. Pero hay una diferencia que <strong>tienes que entender bien</strong> para la KCNA y para no causarte un problema en producción.</p>

      <h2>Qué es realmente un Secret</h2>

      <p>Un Secret es un ConfigMap con tres adornos:</p>

      <ol>
        <li>Los valores se almacenan codificados en <strong>base64</strong> en el objeto.</li>
        <li>Tiene un campo <code>type</code> con tipos built-in para uso conocido.</li>
        <li>Recibe trato especial: kubelet evita escribir Secrets en disco si puede, los logs los redactan, RBAC suele restringirlos.</li>
      </ol>

      <p>Lo que <strong>no</strong> hace un Secret por defecto:</p>

      <ul>
        <li><strong>No los cifra</strong>. Base64 es codificación, no cifrado. <code>echo &lt;blob&gt; | base64 -d</code> y ya tienes el contenido.</li>
        <li><strong>No los oculta</strong> de quien tenga RBAC para leerlos.</li>
        <li><strong>No los rota</strong> automáticamente.</li>
      </ul>

      <p>Para tener Secrets <em>realmente</em> cifrados en reposo hay que activar <em>encryption at rest</em> en el apiserver — lo vemos al final de la sub-parte.</p>

      <h2>Crear un Secret</h2>

      <h3>Desde literales</h3>

      <pre><code>kubectl create secret generic api-creds \\
  --from-literal=username=admin \\
  --from-literal=password='supersecret'</code></pre>

      <h3>Desde archivo</h3>

      <pre><code>kubectl create secret generic tls-key \\
  --from-file=tls.key=./certs/tls.key</code></pre>

      <h3>Desde YAML</h3>

      <p>Aquí entra el primer detalle importante: en el campo <code>data</code>, los valores van en base64. En <code>stringData</code> van en plano y kubectl los codifica al aplicar.</p>

      <pre><code>apiVersion: v1
kind: Secret
metadata:
  name: api-creds
type: Opaque
data:
  username: YWRtaW4=        # base64 de "admin"
  password: c3VwZXJzZWNyZXQ=  # base64 de "supersecret"

# o equivalente:

apiVersion: v1
kind: Secret
metadata:
  name: api-creds
type: Opaque
stringData:
  username: admin
  password: supersecret</code></pre>

      <p>Dato clave: <strong>esto no es cifrado</strong>. Cualquiera con acceso a etcd o a este YAML puede recuperar los valores.</p>

      <h2>Tipos built-in</h2>

      <p>El campo <code>type</code> le dice a Kubernetes qué claves esperar. Los más usados:</p>

      <ul>
        <li><strong><code>Opaque</code></strong>: genérico, claves arbitrarias. El default si no especificas.</li>
        <li><strong><code>kubernetes.io/dockerconfigjson</code></strong>: credenciales para pull de imágenes desde un registry privado. Requiere clave <code>.dockerconfigjson</code>.</li>
        <li><strong><code>kubernetes.io/tls</code></strong>: certificado TLS. Requiere claves <code>tls.crt</code> y <code>tls.key</code>.</li>
        <li><strong><code>kubernetes.io/service-account-token</code></strong>: token de una ServiceAccount. Históricamente lo manejaba Kubernetes solo; ahora se prefiere <em>token projection</em>.</li>
        <li><strong><code>kubernetes.io/basic-auth</code></strong>, <strong><code>kubernetes.io/ssh-auth</code></strong>: credenciales con esquema fijo.</li>
      </ul>

      <h2>Consumirlo desde un Pod</h2>

      <p>Igual que un ConfigMap, con tres formas:</p>

      <pre><code># 1. Una clave como env var:
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: api-creds
        key: password

# 2. Todas las claves como env vars:
envFrom:
  - secretRef:
      name: api-creds

# 3. Como archivos en un volumen (el más recomendado):
volumes:
  - name: creds
    secret:
      secretName: api-creds
volumeMounts:
  - name: creds
    mountPath: /etc/creds
    readOnly: true</code></pre>

      <p>Para Secrets, <strong>el volumen es preferible al env</strong>. Razones:</p>

      <ul>
        <li>Las env vars aparecen en <code>ps</code>, en herramientas de telemetría, en dumps de proceso.</li>
        <li>Los archivos del volumen son <code>tmpfs</code> (memoria, no disco), <code>readOnly</code>, y solo el contenedor que los monta los ve.</li>
        <li>Si rotas el Secret, los archivos se actualizan; las env vars no (lo vemos en la sub-parte de actualización).</li>
      </ul>

      <h2>Encryption at rest</h2>

      <p>Para que los Secrets estén realmente cifrados en etcd, hay que configurar <em>encryption at rest</em> en el apiserver. Es una capa de cifrado que aplica el apiserver antes de escribir cualquier objeto a etcd.</p>

      <p>Se configura con un <code>EncryptionConfiguration</code> que se le pasa al apiserver vía <code>--encryption-provider-config</code>. El detalle de configuración cae fuera del scope de la KCNA, pero <strong>sí</strong> se espera que sepas:</p>

      <ul>
        <li>Por defecto, los Secrets no están cifrados — están en base64.</li>
        <li>Encryption at rest cifra Secrets (y otros recursos si quieres) antes de escribir a etcd.</li>
        <li>Existen providers: <code>aescbc</code>, <code>aesgcm</code>, <code>kms</code> (recomendado, integra con KMS del cloud).</li>
        <li>Activarlo requiere reiniciar el apiserver y, para Secrets ya existentes, leerlos y volverlos a escribir para que se cifren (un <code>kubectl get secrets -A -o json | kubectl replace -f -</code> hace el truco).</li>
      </ul>

      <h2>Para la KCNA</h2>

      <ul>
        <li>Los Secrets viven en <code>v1</code>. Sintácticamente parecidos a ConfigMaps.</li>
        <li><strong>Por defecto, base64 — no cifrado.</strong> Cualquiera con acceso a etcd los puede leer.</li>
        <li><code>type: Opaque</code> es el default; hay tipos especializados (<code>kubernetes.io/tls</code>, <code>kubernetes.io/dockerconfigjson</code>, …).</li>
        <li>Para Secrets, montar como volumen es más seguro que como env vars.</li>
        <li><em>Encryption at rest</em> se configura en el apiserver y es lo que cifra los Secrets en etcd de verdad.</li>
      </ul>

      <p>En la siguiente sub-parte profundizamos en la decisión env vs volumen, y veremos qué pasa cuando un ConfigMap o Secret se modifica — porque la respuesta es menos automática de lo que parece.</p>
    `,
  en: `
      <p>The <code>Secret</code> is the ConfigMap's cousin built for sensitive data: tokens, passwords, certificates. The syntax and consumption forms are nearly identical. But there's a difference you <strong>have to understand well</strong> for the KCNA and to avoid causing yourself a production problem.</p>

      <h2>What a Secret really is</h2>

      <p>A Secret is a ConfigMap with three twists:</p>

      <ol>
        <li>Values are stored <strong>base64-encoded</strong> in the object.</li>
        <li>It has a <code>type</code> field with built-in types for known uses.</li>
        <li>It gets special treatment: kubelet avoids writing Secrets to disk when possible, logs redact them, RBAC typically restricts them.</li>
      </ol>

      <p>What a Secret does <strong>not</strong> do by default:</p>

      <ul>
        <li><strong>It doesn't encrypt them</strong>. Base64 is encoding, not encryption. <code>echo &lt;blob&gt; | base64 -d</code> and you have the content.</li>
        <li><strong>It doesn't hide them</strong> from anyone with RBAC permissions to read them.</li>
        <li><strong>It doesn't rotate them</strong> automatically.</li>
      </ul>

      <p>To get Secrets <em>actually</em> encrypted at rest, you have to enable <em>encryption at rest</em> on the apiserver — covered at the end of the sub-part.</p>

      <h2>Creating a Secret</h2>

      <h3>From literals</h3>

      <pre><code>kubectl create secret generic api-creds \\
  --from-literal=username=admin \\
  --from-literal=password='supersecret'</code></pre>

      <h3>From a file</h3>

      <pre><code>kubectl create secret generic tls-key \\
  --from-file=tls.key=./certs/tls.key</code></pre>

      <h3>From YAML</h3>

      <p>First important detail: in the <code>data</code> field, values must be base64-encoded. In <code>stringData</code> they go as plaintext and kubectl encodes them at apply time.</p>

      <pre><code>apiVersion: v1
kind: Secret
metadata:
  name: api-creds
type: Opaque
data:
  username: YWRtaW4=        # base64 of "admin"
  password: c3VwZXJzZWNyZXQ=  # base64 of "supersecret"

# or equivalently:

apiVersion: v1
kind: Secret
metadata:
  name: api-creds
type: Opaque
stringData:
  username: admin
  password: supersecret</code></pre>

      <p>Key point: <strong>this isn't encryption</strong>. Anyone with access to etcd or to this YAML can recover the values.</p>

      <h2>Built-in types</h2>

      <p>The <code>type</code> field tells Kubernetes which keys to expect. The most used ones:</p>

      <ul>
        <li><strong><code>Opaque</code></strong>: generic, arbitrary keys. The default if you don't specify.</li>
        <li><strong><code>kubernetes.io/dockerconfigjson</code></strong>: credentials for pulling images from a private registry. Requires the key <code>.dockerconfigjson</code>.</li>
        <li><strong><code>kubernetes.io/tls</code></strong>: TLS certificate. Requires keys <code>tls.crt</code> and <code>tls.key</code>.</li>
        <li><strong><code>kubernetes.io/service-account-token</code></strong>: ServiceAccount token. Historically managed by Kubernetes alone; now token <em>projection</em> is preferred.</li>
        <li><strong><code>kubernetes.io/basic-auth</code></strong>, <strong><code>kubernetes.io/ssh-auth</code></strong>: credentials with a fixed schema.</li>
      </ul>

      <h2>Consuming from a Pod</h2>

      <p>Same as a ConfigMap, with three forms:</p>

      <pre><code># 1. One key as an env var:
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: api-creds
        key: password

# 2. All keys as env vars:
envFrom:
  - secretRef:
      name: api-creds

# 3. As files in a volume (most recommended):
volumes:
  - name: creds
    secret:
      secretName: api-creds
volumeMounts:
  - name: creds
    mountPath: /etc/creds
    readOnly: true</code></pre>

      <p>For Secrets, <strong>the volume form is preferable to env</strong>. Reasons:</p>

      <ul>
        <li>Env vars show up in <code>ps</code>, telemetry tools, process dumps.</li>
        <li>Volume files are on <code>tmpfs</code> (memory, not disk), <code>readOnly</code>, and only visible inside the container that mounts them.</li>
        <li>If you rotate the Secret, files update; env vars don't (we'll cover this in the updates sub-part).</li>
      </ul>

      <h2>Encryption at rest</h2>

      <p>To actually have Secrets encrypted in etcd, you configure <em>encryption at rest</em> on the apiserver. It's an encryption layer the apiserver applies before writing any object to etcd.</p>

      <p>Configured via an <code>EncryptionConfiguration</code> passed to the apiserver with <code>--encryption-provider-config</code>. The configuration detail is outside the KCNA scope, but it <strong>does</strong> expect you to know:</p>

      <ul>
        <li>By default, Secrets aren't encrypted — they're base64-encoded.</li>
        <li>Encryption at rest encrypts Secrets (and other resources you choose) before writing to etcd.</li>
        <li>Providers exist: <code>aescbc</code>, <code>aesgcm</code>, <code>kms</code> (recommended, integrates with cloud KMS).</li>
        <li>Enabling it requires restarting the apiserver and, for already-existing Secrets, reading and rewriting them so they get encrypted (<code>kubectl get secrets -A -o json | kubectl replace -f -</code> does the trick).</li>
      </ul>

      <h2>For the KCNA</h2>

      <ul>
        <li>Secrets live in <code>v1</code>. Syntactically similar to ConfigMaps.</li>
        <li><strong>By default, base64 — not encrypted.</strong> Anyone with access to etcd can read them.</li>
        <li><code>type: Opaque</code> is the default; specialized types exist (<code>kubernetes.io/tls</code>, <code>kubernetes.io/dockerconfigjson</code>, …).</li>
        <li>For Secrets, mounting as a volume is safer than as env vars.</li>
        <li><em>Encryption at rest</em> is configured on the apiserver and is what actually encrypts Secrets in etcd.</li>
      </ul>

      <p>In the next sub-part we go deeper into the env vs volume decision, and look at what happens when a ConfigMap or Secret is modified — because the answer is less automatic than it seems.</p>
    `,
}
