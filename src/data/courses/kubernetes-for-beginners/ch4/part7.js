export default {
  es: `
      <p>Cerramos el capítulo de Deployments. Lo que en el <a href="/course/kubernetes-for-beginners/pods">capítulo 3</a> era un Pod efímero, ahora es una unidad gestionada con replicación, escalado y rollback. La cadena Deployment → ReplicaSet → Pod te da, casi gratis, las propiedades que la gente espera de "una app cloud-native".</p>

      <h2>El mapa mental</h2>

      <p>Tres niveles, cada uno con un trabajo específico:</p>

      <ul>
        <li><strong>Pod</strong>: el entorno donde corren tus contenedores. Sin inteligencia propia, solo es la unidad mínima.</li>
        <li><strong>ReplicaSet</strong>: el controller que mantiene <em>N</em> Pods que matcheen un selector. No actualiza imágenes, solo cuenta.</li>
        <li><strong>Deployment</strong>: la capa de versiones encima del ReplicaSet. Cada cambio crea un nuevo RS y rota Pods entre el viejo y el nuevo. El viejo se queda con <code>replicas: 0</code> como red de seguridad para rollbacks.</li>
      </ul>

      <p>Las labels son el pegamento que conecta todo: Deployment → ReplicaSet → Pod, y más adelante Service → Pod, NetworkPolicy → Pod, etc. Si las labels no matchean, el sistema no encuentra a sus partes.</p>

      <h2>Lo que vimos, comprimido</h2>

      <ul>
        <li><strong>ReplicaSet</strong>: bucle que mantiene N Pods. Adopta cualquier Pod que matchee su selector.</li>
        <li><strong>Deployment</strong>: añade <code>strategy</code> (RollingUpdate / Recreate) con <code>maxSurge</code> y <code>maxUnavailable</code>.</li>
        <li><strong>Labels y selectors</strong>: matchLabels (equality) y matchExpressions (set). El selector del Deployment debe matchear las labels del template.</li>
        <li><strong>Comandos diarios</strong>: <code>kubectl scale</code>, <code>kubectl set image</code>, <code>kubectl rollout status/history</code>.</li>
        <li><strong>Rollback</strong>: <code>kubectl rollout undo</code> aprovecha los ReplicaSets viejos. <code>revisionHistoryLimit</code> controla cuántos se guardan.</li>
      </ul>

      <h2>Claves KCNA del capítulo</h2>

      <ul>
        <li>Deployment vive en <code>apps/v1</code>, igual que ReplicaSet, StatefulSet y DaemonSet.</li>
        <li>El selector del Deployment es inmutable después de crearlo. Si necesitas cambiarlo, hay que recrear el Deployment.</li>
        <li>Estrategia default: <code>RollingUpdate</code> con <code>maxSurge: 25%, maxUnavailable: 25%</code>. Tunealas según necesidad.</li>
        <li>Sin <code>readinessProbe</code>, un rolling update puede causar errores aunque sea técnicamente "rolling".</li>
        <li>Los ReplicaSets viejos se conservan según <code>revisionHistoryLimit</code> (default 10), con <code>replicas: 0</code>.</li>
        <li><code>kubectl rollout undo</code> revierte a la revisión anterior; <code>--to-revision=N</code> a una específica.</li>
      </ul>

      <h2>Qué viene</h2>

      <p>Tienes ya cómo desplegar y mantener una app stateless. Pero las apps reales tienen configuración: variables de entorno, URLs de servicios externos, archivos de configuración, credenciales. Hardcodearlas en la imagen es un anti-patrón clásico (cada cambio requiere rebuild + nuevo rollout).</p>

      <p>El <a href="/course/kubernetes-for-beginners/configmaps-secrets">capítulo 5 (ConfigMaps y Secrets)</a> arregla eso: cómo separar configuración del código, cómo inyectarla a tus Pods (vía env o volúmenes), y la diferencia real entre "un Secret" y "lo que la mayoría llamaría secreto" (spoiler: por defecto, los Secrets no son tan secretos como crees).</p>
    `,
  en: `
      <p>We're closing the Deployments chapter. What was an ephemeral Pod in <a href="/course/kubernetes-for-beginners/pods">chapter 3</a> is now a managed unit with replication, scaling, and rollback. The Deployment → ReplicaSet → Pod chain gives you, almost for free, the properties people expect from "a cloud-native app".</p>

      <h2>The mental map</h2>

      <p>Three levels, each with a specific job:</p>

      <ul>
        <li><strong>Pod</strong>: the environment where your containers run. No intelligence of its own — just the minimum unit.</li>
        <li><strong>ReplicaSet</strong>: the controller that keeps <em>N</em> Pods matching a selector. It doesn't update images, just counts.</li>
        <li><strong>Deployment</strong>: the version layer on top of ReplicaSet. Each change creates a new RS and rotates Pods between old and new. The old one stays at <code>replicas: 0</code> as a rollback safety net.</li>
      </ul>

      <p>Labels are the glue connecting everything: Deployment → ReplicaSet → Pod, and later Service → Pod, NetworkPolicy → Pod, etc. If labels don't match, the system can't find its own parts.</p>

      <h2>What we saw, compressed</h2>

      <ul>
        <li><strong>ReplicaSet</strong>: a loop that keeps N Pods. Adopts any Pod matching its selector.</li>
        <li><strong>Deployment</strong>: adds <code>strategy</code> (RollingUpdate / Recreate) with <code>maxSurge</code> and <code>maxUnavailable</code>.</li>
        <li><strong>Labels and selectors</strong>: matchLabels (equality) and matchExpressions (set). The Deployment's selector must match the template's labels.</li>
        <li><strong>Daily commands</strong>: <code>kubectl scale</code>, <code>kubectl set image</code>, <code>kubectl rollout status/history</code>.</li>
        <li><strong>Rollback</strong>: <code>kubectl rollout undo</code> reuses old ReplicaSets. <code>revisionHistoryLimit</code> controls how many are kept.</li>
      </ul>

      <h2>KCNA keys from the chapter</h2>

      <ul>
        <li>Deployment lives in <code>apps/v1</code>, same as ReplicaSet, StatefulSet, and DaemonSet.</li>
        <li>The Deployment's selector is immutable after creation. To change it, you must recreate the Deployment.</li>
        <li>Default strategy: <code>RollingUpdate</code> with <code>maxSurge: 25%, maxUnavailable: 25%</code>. Tune as needed.</li>
        <li>Without a <code>readinessProbe</code>, a rolling update can cause errors even though it's technically "rolling".</li>
        <li>Old ReplicaSets are kept per <code>revisionHistoryLimit</code> (default 10), with <code>replicas: 0</code>.</li>
        <li><code>kubectl rollout undo</code> reverts to the previous revision; <code>--to-revision=N</code> to a specific one.</li>
      </ul>

      <h2>What's next</h2>

      <p>You now have a way to deploy and maintain a stateless app. But real apps have configuration: env vars, URLs to external services, config files, credentials. Hard-coding them in the image is a classic anti-pattern (every change needs a rebuild + new rollout).</p>

      <p><a href="/course/kubernetes-for-beginners/configmaps-secrets">Chapter 5 (ConfigMaps and Secrets)</a> fixes that: how to separate configuration from code, how to inject it into your Pods (via env or volumes), and the real difference between "a Secret" and "what most people would call secret" (spoiler: by default, Secrets aren't as secret as you think).</p>
    `,
};
