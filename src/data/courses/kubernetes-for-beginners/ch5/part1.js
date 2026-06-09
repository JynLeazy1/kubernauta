export default {
  es: `
      <p>Cerramos el <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">capítulo 4</a> con una promesa: separar configuración del código. Hardcodear URLs, flags, contraseñas en la imagen del contenedor convierte cada cambio menor — un endpoint que se mueve, una llave que rota — en un rebuild + push + nuevo rollout. Y eso, a escala, es insostenible.</p>

      <p>Kubernetes resuelve el problema con dos objetos primos hermanos: <code>ConfigMap</code> y <code>Secret</code>. Mismo modelo de datos (claves y valores), mismas formas de inyectarlos a un Pod (env vars o archivos), una diferencia operativa importante.</p>

      <h2>El principio: app + ambiente</h2>

      <p>La idea, vieja como Unix, es que una imagen de contenedor debería ser <strong>portable entre ambientes</strong>: la misma imagen corre en dev, en staging, en prod. Lo único que cambia es la configuración inyectada.</p>

      <p>El <em>12-Factor App</em> (que vamos a ver formalmente en el <a href="/course/kubernetes-for-beginners/cloud-native-ecosystem">capítulo 16</a>) lo declara como factor 3: <em>Store config in the environment</em>. Kubernetes lo concreta con ConfigMap y Secret.</p>

      <h2>ConfigMap vs Secret en una frase</h2>

      <ul>
        <li><strong>ConfigMap</strong>: configuración no sensible. URLs, feature flags, tamaños de cache, niveles de log.</li>
        <li><strong>Secret</strong>: configuración sensible. API keys, contraseñas, certificados, tokens de DB.</li>
      </ul>

      <p>La diferencia no es de modelo (los dos guardan claves y valores) sino de tratamiento operacional: los Secrets se loguean menos, se cifran en reposo si activas <em>encryption at rest</em>, y RBAC suele restringirlos más estrictamente. Pero en su forma básica — un Secret recién aplicado, sin encryption at rest activada — el contenido está en etcd codificado en base64. <strong>No cifrado.</strong></p>

      <p>Es uno de los puntos donde el examen KCNA pega más fuerte y donde más gente se equivoca. Lo veremos a fondo en la sub-parte de Secrets.</p>

      <h2>Por qué un objeto separado y no env vars en el Pod</h2>

      <p>Podrías meter las env vars directamente en el spec del Pod:</p>

      <pre><code>containers:
  - name: app
    image: myapp:1.0
    env:
      - name: DATABASE_URL
        value: postgres://prod-db:5432/myapp
      - name: API_KEY
        value: "sk-prod-secret"</code></pre>

      <p>Funciona, pero rompe varias cosas:</p>

      <ul>
        <li>El YAML del Deployment ahora <em>contiene</em> los secretos — está en git, lo ven todos.</li>
        <li>Si quieres cambiar el endpoint de la DB, modificas el Deployment y disparas un rollout completo.</li>
        <li>No puedes compartir la misma config entre Pods distintos sin duplicarla.</li>
      </ul>

      <p>ConfigMap y Secret arreglan los tres: el Pod referencia un nombre, no el valor. La fuente de verdad vive en otro objeto, gestionable por separado, posiblemente con permisos distintos.</p>

      <h2>Lo que vamos a ver en el capítulo</h2>

      <ol>
        <li><strong>ConfigMap</strong>: cómo se crea (literal, archivo, directorio) y cómo se consume.</li>
        <li><strong>Secret</strong>: tipos built-in, base64 vs cifrado real, encryption at rest.</li>
        <li><strong>Volumen vs env</strong>: cuándo conviene cada forma de inyectarlos al Pod.</li>
        <li><strong>Actualización</strong>: qué pasa cuando cambian. Spoiler: no es lo que esperas.</li>
        <li><strong>Límites y alternativas</strong>: external-secrets, sealed-secrets, encryption providers.</li>
      </ol>

      <p>Al terminar, vas a saber decidir qué tipo usar, cómo inyectarlo correctamente, y entender por qué los Secrets de Kubernetes <em>solos</em> no son una solución de gestión de secretos seria — y qué herramientas la complementan.</p>
    `,
  en: `
      <p>We closed <a href="/course/kubernetes-for-beginners/replicasets-and-deployments">chapter 4</a> with a promise: separate configuration from code. Hard-coding URLs, flags, and passwords in the container image turns every minor change — a moving endpoint, a rotated key — into a rebuild + push + new rollout. At scale, that's not sustainable.</p>

      <p>Kubernetes solves the problem with two close cousins: <code>ConfigMap</code> and <code>Secret</code>. Same data model (keys and values), same ways to inject them into a Pod (env vars or files), one important operational difference.</p>

      <h2>The principle: app + environment</h2>

      <p>The idea, as old as Unix, is that a container image should be <strong>portable across environments</strong>: the same image runs in dev, staging, prod. The only thing that changes is the injected configuration.</p>

      <p>The <em>12-Factor App</em> (which we'll cover formally in <a href="/course/kubernetes-for-beginners/cloud-native-ecosystem">chapter 16</a>) calls this Factor 3: <em>Store config in the environment</em>. Kubernetes makes it concrete with ConfigMap and Secret.</p>

      <h2>ConfigMap vs Secret in one sentence</h2>

      <ul>
        <li><strong>ConfigMap</strong>: non-sensitive configuration. URLs, feature flags, cache sizes, log levels.</li>
        <li><strong>Secret</strong>: sensitive configuration. API keys, passwords, certificates, DB tokens.</li>
      </ul>

      <p>The difference isn't in the data model (both store keys and values) but in operational handling: Secrets are logged less, encrypted at rest if you turn on <em>encryption at rest</em>, and typically restricted more tightly via RBAC. But in their basic form — a freshly applied Secret without encryption at rest enabled — the content sits in etcd <strong>encoded as base64. Not encrypted.</strong></p>

      <p>It's one of the spots where the KCNA exam hits hardest and where most people get tripped up. We'll cover it in depth in the Secrets sub-part.</p>

      <h2>Why a separate object, not env vars in the Pod</h2>

      <p>You could put env vars directly in the Pod spec:</p>

      <pre><code>containers:
  - name: app
    image: myapp:1.0
    env:
      - name: DATABASE_URL
        value: postgres://prod-db:5432/myapp
      - name: API_KEY
        value: "sk-prod-secret"</code></pre>

      <p>It works, but breaks several things:</p>

      <ul>
        <li>The Deployment YAML now <em>contains</em> the secrets — it's in git, everyone sees it.</li>
        <li>To change the DB endpoint, you modify the Deployment and trigger a full rollout.</li>
        <li>You can't share the same config across different Pods without duplicating it.</li>
      </ul>

      <p>ConfigMap and Secret fix all three: the Pod references a name, not the value. The source of truth lives in another object, managed separately, possibly with different permissions.</p>

      <h2>What we'll cover</h2>

      <ol>
        <li><strong>ConfigMap</strong>: how to create one (literal, file, directory) and how to consume it.</li>
        <li><strong>Secret</strong>: built-in types, base64 vs real encryption, encryption at rest.</li>
        <li><strong>Volume vs env</strong>: when each injection method is the right call.</li>
        <li><strong>Updates</strong>: what happens when they change. Spoiler: not what you'd expect.</li>
        <li><strong>Limits and alternatives</strong>: external-secrets, sealed-secrets, encryption providers.</li>
      </ol>

      <p>By the end, you'll know which type to use, how to inject it correctly, and understand why Kubernetes Secrets <em>alone</em> aren't a serious secret-management solution — and which tools complement them.</p>
    `,
}
