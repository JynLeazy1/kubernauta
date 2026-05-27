export default {
  es: `
      <p>Ya sabes qué es un Pod conceptualmente. Ahora vamos a bajarlo al YAML: cuando alguien te pase un manifest, qué estás leyendo exactamente, qué es obligatorio y qué opcional, y por qué cada campo está donde está.</p>

      <h2>La estructura mínima</h2>

      <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
    - name: nginx
      image: nginx:1.27</code></pre>

      <p>Ese YAML de 7 líneas es un Pod válido que Kubernetes acepta y levanta. Vale la pena detenerse un segundo: no hay <code>replicas</code>, no hay <code>selector</code>, no hay <code>strategy</code>. Esos viven en los objetos de nivel superior (Deployment, StatefulSet, etc.) — en el <code>Pod</code> a secas, tu responsabilidad se reduce a declarar qué contenedores corren y cómo.</p>

      <p>Fíjate que <code>apiVersion: v1</code> no lleva grupo. Como vimos en el <a href="/course/kubernetes-for-beginners/api-and-declarative-model/grupos-y-versiones">capítulo 2</a>, Pod vive en el grupo <em>core</em>, que es el único sin prefijo en su <code>apiVersion</code>.</p>

      <h2>La sección <code>containers</code></h2>

      <p>Es lo único verdaderamente obligatorio dentro del <code>spec</code>. Un array de uno o más contenedores, cada uno con su propio bloque:</p>

      <pre><code>spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
      env:
        - name: ENV
          value: production
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi
      volumeMounts:
        - name: config
          mountPath: /etc/nginx/conf.d</code></pre>

      <p>Los campos más usados:</p>

      <ul>
        <li><strong><code>name</code></strong>: identificador dentro del Pod (únicamente local — no tiene que ser único en el cluster).</li>
        <li><strong><code>image</code></strong>: la imagen OCI, con tag explícito. Nunca uses <code>:latest</code> en producción — queda para los demos.</li>
        <li><strong><code>ports</code></strong>: puertos que el contenedor expone. Es informativo — Kubernetes no hace port-mapping como Docker.</li>
        <li><strong><code>env</code></strong>: variables de entorno. Pueden ser literales (<code>value</code>) o referenciar Secrets/ConfigMaps con <code>valueFrom</code>.</li>
        <li><strong><code>resources</code></strong>: <code>requests</code> (lo que el scheduler garantiza) y <code>limits</code> (el tope). Lo vemos a fondo en el <a href="/course/kubernetes-for-beginners/scheduling">capítulo 8</a>.</li>
        <li><strong><code>volumeMounts</code></strong>: montar un volumen del Pod en una ruta dentro del contenedor. Requiere que el volumen esté declarado en <code>spec.volumes</code>.</li>
      </ul>

      <h2>Volúmenes: declaración vs montaje</h2>

      <p>Hay dos partes separadas:</p>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: config         # referencia al volumen
          mountPath: /etc/app
  volumes:
    - name: config             # declaración del volumen
      configMap:
        name: app-config</code></pre>

      <p>El <code>spec.volumes</code> declara <em>qué</em> volumen existe en el Pod. Cada contenedor elige qué volúmenes monta y dónde con <code>volumeMounts</code>. Esta separación permite compartir el mismo volumen entre contenedores del Pod — escribir en un volumen desde uno y leerlo desde otro es precisamente cómo funcionan la mayoría de los sidecars.</p>

      <p>Los tipos de volumen más comunes (<code>configMap</code>, <code>secret</code>, <code>emptyDir</code>, <code>persistentVolumeClaim</code>) los cubrimos en el <a href="/course/kubernetes-for-beginners/persistent-volumes">capítulo 12</a>.</p>

      <h2>Campos del Pod (fuera de containers)</h2>

      <p>Varias cosas importantes viven en <code>spec</code> pero fuera del array de containers:</p>

      <ul>
        <li><strong><code>restartPolicy</code></strong>: qué hacer cuando un contenedor termina. Default <code>Always</code>. Los Jobs usan <code>OnFailure</code> o <code>Never</code>. Lo vemos en la <a href="/course/kubernetes-for-beginners/pods/ciclo-de-vida">sub-parte 5</a>.</li>
        <li><strong><code>nodeSelector</code>, <code>affinity</code>, <code>tolerations</code></strong>: pistas para el scheduler. Detalle en el <a href="/course/kubernetes-for-beginners/scheduling">capítulo 8</a>.</li>
        <li><strong><code>serviceAccountName</code></strong>: con qué identidad habla el Pod al apiserver. Default <code>default</code> del namespace. Detalle en el <a href="/course/kubernetes-for-beginners/security-rbac-serviceaccounts">capítulo 14</a>.</li>
        <li><strong><code>securityContext</code></strong>: opciones de seguridad (runAsUser, runAsNonRoot, fsGroup…). Hay uno a nivel Pod y otro por contenedor.</li>
        <li><strong><code>terminationGracePeriodSeconds</code></strong>: cuánto tiempo se le da a los contenedores para cerrar cuando se borra el Pod (default 30s).</li>
      </ul>

      <h2>Un manifest completo para referencia</h2>

      <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: web
  namespace: default
  labels:
    app: web
    tier: frontend
spec:
  restartPolicy: Always
  serviceAccountName: default
  terminationGracePeriodSeconds: 30
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
      env:
        - name: NGINX_PORT
          value: "80"
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi
      volumeMounts:
        - name: config
          mountPath: /etc/nginx/conf.d
          readOnly: true
      livenessProbe:
        httpGet:
          path: /healthz
          port: 80
        initialDelaySeconds: 10
        periodSeconds: 10
  volumes:
    - name: config
      configMap:
        name: nginx-config</code></pre>

      <p>Este manifest ya es útil para la KCNA: si puedes explicar qué hace <em>cada</em> línea, vas bien. En la siguiente sub-parte abrimos el caso multi-contenedor y cuándo vale la pena usarlo.</p>
    `,
  en: `
      <p>You know what a Pod is conceptually. Now let's drop down to the YAML: when someone hands you a manifest, what are you actually reading, what's required and what's optional, and why each field is where it is.</p>

      <h2>The minimum structure</h2>

      <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
    - name: nginx
      image: nginx:1.27</code></pre>

      <p>Those 7 lines are a valid Pod that Kubernetes accepts and brings up. Worth a pause: there's no <code>replicas</code>, no <code>selector</code>, no <code>strategy</code>. Those live in higher-level objects (Deployment, StatefulSet, etc.) — in the <code>Pod</code> proper, your job boils down to declaring which containers run and how.</p>

      <p>Note that <code>apiVersion: v1</code> has no group. As we saw in <a href="/course/kubernetes-for-beginners/api-and-declarative-model/grupos-y-versiones">chapter 2</a>, Pod lives in the <em>core</em> group, the only one with no prefix in its <code>apiVersion</code>.</p>

      <h2>The <code>containers</code> section</h2>

      <p>It's the only thing truly required inside <code>spec</code>. An array of one or more containers, each with its own block:</p>

      <pre><code>spec:
  containers:
    - name: web
      image: nginx:1.27
      ports:
        - containerPort: 80
      env:
        - name: ENV
          value: production
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi
      volumeMounts:
        - name: config
          mountPath: /etc/nginx/conf.d</code></pre>

      <p>The most-used fields:</p>

      <ul>
        <li><strong><code>name</code></strong>: identifier within the Pod (locally unique only — it doesn't need to be unique cluster-wide).</li>
        <li><strong><code>image</code></strong>: the OCI image, with an explicit tag. Never use <code>:latest</code> in production — save it for demos.</li>
        <li><strong><code>ports</code></strong>: ports the container exposes. Informational only — Kubernetes doesn't do port mapping like Docker does.</li>
        <li><strong><code>env</code></strong>: environment variables. Can be literal (<code>value</code>) or reference Secrets/ConfigMaps via <code>valueFrom</code>.</li>
        <li><strong><code>resources</code></strong>: <code>requests</code> (what the scheduler guarantees) and <code>limits</code> (the cap). We cover this in depth in <a href="/course/kubernetes-for-beginners/scheduling">chapter 8</a>.</li>
        <li><strong><code>volumeMounts</code></strong>: mount a Pod-level volume at a path inside the container. Requires the volume to be declared in <code>spec.volumes</code>.</li>
      </ul>

      <h2>Volumes: declaration vs mount</h2>

      <p>There are two separate pieces:</p>

      <pre><code>spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: config         # reference to the volume
          mountPath: /etc/app
  volumes:
    - name: config             # volume declaration
      configMap:
        name: app-config</code></pre>

      <p><code>spec.volumes</code> declares <em>which</em> volumes exist in the Pod. Each container picks what to mount and where with <code>volumeMounts</code>. This separation lets you share the same volume across containers in the Pod — writing to a volume from one container and reading it from another is exactly how most sidecars work.</p>

      <p>The most common volume types (<code>configMap</code>, <code>secret</code>, <code>emptyDir</code>, <code>persistentVolumeClaim</code>) are covered in <a href="/course/kubernetes-for-beginners/persistent-volumes">chapter 12</a>.</p>

      <h2>Pod-level fields (outside containers)</h2>

      <p>Several important things live in <code>spec</code> but outside the containers array:</p>

      <ul>
        <li><strong><code>restartPolicy</code></strong>: what to do when a container exits. Default <code>Always</code>. Jobs use <code>OnFailure</code> or <code>Never</code>. We cover this in <a href="/course/kubernetes-for-beginners/pods/ciclo-de-vida">sub-part 5</a>.</li>
        <li><strong><code>nodeSelector</code>, <code>affinity</code>, <code>tolerations</code></strong>: hints for the scheduler. Detail in <a href="/course/kubernetes-for-beginners/scheduling">chapter 8</a>.</li>
        <li><strong><code>serviceAccountName</code></strong>: which identity the Pod uses to talk to the apiserver. Default is the namespace's <code>default</code>. Detail in <a href="/course/kubernetes-for-beginners/security-rbac-serviceaccounts">chapter 14</a>.</li>
        <li><strong><code>securityContext</code></strong>: security options (runAsUser, runAsNonRoot, fsGroup…). One at the Pod level and one per container.</li>
        <li><strong><code>terminationGracePeriodSeconds</code></strong>: how long containers are given to shut down when the Pod is deleted (default 30s).</li>
      </ul>

      <h2>A full manifest for reference</h2>

      <pre><code>apiVersion: v1
kind: Pod
metadata:
  name: web
  namespace: default
  labels:
    app: web
    tier: frontend
spec:
  restartPolicy: Always
  serviceAccountName: default
  terminationGracePeriodSeconds: 30
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
      env:
        - name: NGINX_PORT
          value: "80"
      resources:
        requests:
          cpu: 100m
          memory: 128Mi
        limits:
          cpu: 500m
          memory: 256Mi
      volumeMounts:
        - name: config
          mountPath: /etc/nginx/conf.d
          readOnly: true
      livenessProbe:
        httpGet:
          path: /healthz
          port: 80
        initialDelaySeconds: 10
        periodSeconds: 10
  volumes:
    - name: config
      configMap:
        name: nginx-config</code></pre>

      <p>This manifest is already useful for the KCNA: if you can explain what <em>every</em> line does, you're in good shape. In the next sub-part we open the multi-container case and when it's worth using.</p>
    `,
};
