export default {
  es: `
      <p>Una de las ideas más poderosas de Kubernetes es que <strong>la API no está cerrada</strong>. Todo lo que hemos visto — Pods, Deployments, Services — son tipos <em>built-in</em>, pero no son especiales. Cualquier tipo nuevo que agregues al cluster se comporta igual: tiene <code>spec</code>, <code>status</code>, <code>metadata</code>, se versiona, se consulta con <code>kubectl</code>, pasa por admission, se guarda en etcd.</p>

      <p>El mecanismo para añadir tipos se llama <strong>Custom Resource Definition</strong> — <code>CRD</code>. Y entenderlo abre una de las puertas más importantes del ecosistema: los <em>Operators</em>.</p>

      <h2>Qué es un CRD</h2>

      <p>Un <code>CustomResourceDefinition</code> es un objeto de Kubernetes (sí, la API se define a sí misma recursivamente) que le dice al apiserver: <em>"a partir de ahora existe un tipo nuevo llamado <code>X</code>, con estos campos, en este grupo"</em>. Apenas aplicas el CRD, el apiserver empieza a aceptar objetos de ese tipo exactamente como si fueran built-in.</p>

      <p>Ejemplo mínimo — definir un recurso <code>CronTab</code>:</p>

      <pre><code>apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: crontabs.stable.example.com
spec:
  group: stable.example.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                cronSpec:
                  type: string
                image:
                  type: string
  scope: Namespaced
  names:
    plural: crontabs
    singular: crontab
    kind: CronTab
    shortNames:
      - ct</code></pre>

      <p>Aplicar este YAML crea el tipo. A partir de ahí puedes hacer:</p>

      <pre><code>kubectl get crontabs
kubectl apply -f my-crontab.yaml
kubectl describe crontab my-crontab</code></pre>

      <p>Y el apiserver lo atenderá igual que a cualquier otro recurso.</p>

      <h2>¿Qué ganas con esto?</h2>

      <p>La API es el lenguaje universal del cluster. Todo lo que existe en Kubernetes se expresa como objetos. Cuando extiendes ese lenguaje con CRDs, todo lo que ya funciona sobre la API funciona también con tus tipos: GitOps con Argo CD, validación con OPA/Gatekeeper, kubectl, RBAC, audit logs, webhooks, todo.</p>

      <p>Algunos ejemplos del mundo real:</p>

      <ul>
        <li><strong>cert-manager</strong> define <code>Certificate</code>, <code>Issuer</code>, <code>CertificateRequest</code> como CRDs.</li>
        <li><strong>Argo CD</strong> define <code>Application</code> y <code>ApplicationSet</code>.</li>
        <li><strong>Prometheus Operator</strong> define <code>ServiceMonitor</code>, <code>PrometheusRule</code>, <code>Alertmanager</code>.</li>
        <li><strong>Istio</strong> define <code>VirtualService</code>, <code>DestinationRule</code>, <code>Gateway</code>.</li>
      </ul>

      <p>En cada caso, los CRDs permiten que el producto se configure <em>"the Kubernetes way"</em>: un YAML por recurso, almacenado en el cluster, reconciliado por un controller.</p>

      <h2>CRD sin controller: solo datos</h2>

      <p>Aquí hay un detalle que mucha gente pasa por alto: un CRD por sí solo <strong>no hace nada</strong>. Es solo una forma de guardar datos estructurados en etcd, expuestos con la API del cluster.</p>

      <p>Si defines un CRD <code>CronTab</code> y creas un objeto <code>my-crontab</code>, el apiserver lo guarda, <code>kubectl</code> lo muestra, y… nada más pasa. Nadie va a crear un Pod para ejecutar ese CronTab. Lo que hace que un CRD "cobre vida" es un <strong>controller custom</strong> que vigila ese tipo y actúa.</p>

      <h2>Operator pattern: CRD + controller</h2>

      <p>La combinación <em>CRD + controller que reconcilia ese tipo</em> es lo que se conoce como <strong>Operator pattern</strong>. Lo mencionamos en la <a href="/course/kubernetes-for-beginners/api-and-declarative-model/controllers">sub-parte anterior</a>: es la aplicación natural del patrón de control a un dominio específico.</p>

      <p>Un operator de PostgreSQL, por ejemplo:</p>

      <ol>
        <li>Define CRDs: <code>PostgresCluster</code>, <code>PostgresBackup</code>, <code>PostgresUser</code>.</li>
        <li>Corre un controller (normalmente en un Deployment dentro del cluster) que vigila esos tipos.</li>
        <li>Cuando alguien crea un <code>PostgresCluster</code>, el controller crea los StatefulSets, Services, ConfigMaps y Secrets necesarios — automatizando lo que un DBA haría a mano.</li>
      </ol>

      <p>El "dominio específico" puede ser cualquier cosa: bases de datos, message queues, certificados, GitOps, ML pipelines. Si encaja en el modelo declarativo, encaja en un operator.</p>

      <div class="callout callout-note">
        <span class="callout-label">Próximamente</span>
        <p>En el backlog de la plataforma hay dos tutoriales pensados para esto: <em>"Crear un CRD desde 0"</em> y <em>"Escribir un operator"</em>. Cuando se publiquen, vas a construir exactamente este patrón paso a paso.</p>
      </div>

      <h2>Validación y versioning de CRDs</h2>

      <p>Un CRD serio incluye tres cosas:</p>

      <ul>
        <li><strong>Un OpenAPI v3 schema</strong> — define los campos válidos y sus tipos, para que el apiserver rechace YAMLs malformados.</li>
        <li><strong>Versiones explícitas</strong> — igual que los tipos built-in, un CRD puede tener <code>v1alpha1</code>, <code>v1beta1</code>, <code>v1</code>. Solo una versión es la "de almacenamiento" (<code>storage: true</code>), las demás se convierten on-the-fly.</li>
        <li><strong>Subresources</strong> — <code>status</code> y <code>scale</code> como subresources propios, para respetar el patrón de que el status lo actualiza solo el controller.</li>
      </ul>

      <h2>CRDs frente a API aggregation</h2>

      <p>Existe una segunda forma de extender la API: <em>API aggregation</em>, donde expones otro apiserver propio que el apiserver principal delega rutas. Es más poderoso pero también más complejo (tienes que correr y mantener un apiserver). Para el 99% de los casos, un CRD basta.</p>

      <p>Para la KCNA basta con saber que:</p>

      <ul>
        <li>Los CRDs son la forma principal de extender la API.</li>
        <li>Un CRD sin controller no hace nada funcional; solo guarda datos.</li>
        <li>La combinación CRD + controller = Operator.</li>
        <li>Existe también API aggregation para casos avanzados.</li>
      </ul>

      <p>En la siguiente sub-parte bajamos al lado del cliente: cómo se trabaja con todos estos objetos desde <code>kubectl</code>, y qué diferencia hay entre <code>apply</code>, <code>create</code>, <code>--dry-run</code> y el <em>server-side apply</em>.</p>
    `,
  en: `
      <p>One of the most powerful ideas in Kubernetes is that <strong>the API is not closed</strong>. Everything we've seen — Pods, Deployments, Services — are <em>built-in</em> types, but they are not special. Any new type you add to the cluster behaves the same: it has <code>spec</code>, <code>status</code>, <code>metadata</code>, it's versioned, you query it with <code>kubectl</code>, it goes through admission, it's stored in etcd.</p>

      <p>The mechanism for adding types is called a <strong>Custom Resource Definition</strong> — <code>CRD</code>. And understanding it opens one of the most important doors in the ecosystem: <em>Operators</em>.</p>

      <h2>What a CRD is</h2>

      <p>A <code>CustomResourceDefinition</code> is a Kubernetes object (yes, the API defines itself recursively) that tells the apiserver: <em>"from now on there is a new type called <code>X</code>, with these fields, in this group"</em>. The moment you apply the CRD, the apiserver starts accepting objects of that type exactly as if they were built-in.</p>

      <p>Minimal example — define a <code>CronTab</code> resource:</p>

      <pre><code>apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: crontabs.stable.example.com
spec:
  group: stable.example.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                cronSpec:
                  type: string
                image:
                  type: string
  scope: Namespaced
  names:
    plural: crontabs
    singular: crontab
    kind: CronTab
    shortNames:
      - ct</code></pre>

      <p>Applying this YAML creates the type. From then on you can do:</p>

      <pre><code>kubectl get crontabs
kubectl apply -f my-crontab.yaml
kubectl describe crontab my-crontab</code></pre>

      <p>And the apiserver will treat it like any other resource.</p>

      <h2>What do you gain?</h2>

      <p>The API is the cluster's universal language. Everything that exists in Kubernetes is expressed as objects. When you extend that language with CRDs, everything that already works over the API works with your types too: GitOps with Argo CD, validation with OPA/Gatekeeper, kubectl, RBAC, audit logs, webhooks, everything.</p>

      <p>Some real-world examples:</p>

      <ul>
        <li><strong>cert-manager</strong> defines <code>Certificate</code>, <code>Issuer</code>, <code>CertificateRequest</code> as CRDs.</li>
        <li><strong>Argo CD</strong> defines <code>Application</code> and <code>ApplicationSet</code>.</li>
        <li><strong>Prometheus Operator</strong> defines <code>ServiceMonitor</code>, <code>PrometheusRule</code>, <code>Alertmanager</code>.</li>
        <li><strong>Istio</strong> defines <code>VirtualService</code>, <code>DestinationRule</code>, <code>Gateway</code>.</li>
      </ul>

      <p>In every case, CRDs let the product be configured <em>"the Kubernetes way"</em>: one YAML per resource, stored in the cluster, reconciled by a controller.</p>

      <h2>CRD without controller: just data</h2>

      <p>Here's a detail many people miss: a CRD on its own <strong>does nothing</strong>. It's only a way to store structured data in etcd, exposed through the cluster API.</p>

      <p>If you define a <code>CronTab</code> CRD and create a <code>my-crontab</code> object, the apiserver stores it, <code>kubectl</code> shows it, and… that's it. No one creates a Pod to execute that CronTab. What makes a CRD "come alive" is a <strong>custom controller</strong> that watches the type and acts.</p>

      <h2>Operator pattern: CRD + controller</h2>

      <p>The combination <em>CRD + controller that reconciles the type</em> is what's known as the <strong>Operator pattern</strong>. We mentioned it in the <a href="/course/kubernetes-for-beginners/api-and-declarative-model/controllers">previous sub-part</a>: it's the natural application of the control pattern to a specific domain.</p>

      <p>A PostgreSQL operator, for instance:</p>

      <ol>
        <li>Defines CRDs: <code>PostgresCluster</code>, <code>PostgresBackup</code>, <code>PostgresUser</code>.</li>
        <li>Runs a controller (usually in a Deployment inside the cluster) that watches those types.</li>
        <li>When someone creates a <code>PostgresCluster</code>, the controller creates the StatefulSets, Services, ConfigMaps, and Secrets needed — automating what a DBA would do by hand.</li>
      </ol>

      <p>The "specific domain" can be anything: databases, message queues, certificates, GitOps, ML pipelines. If it fits the declarative model, it fits an operator.</p>

      <div class="callout callout-note">
        <span class="callout-label">Coming soon</span>
        <p>The platform backlog has two tutorials planned for this: <em>"Create a CRD from scratch"</em> and <em>"Write an operator"</em>. Once they publish, you'll build exactly this pattern step by step.</p>
      </div>

      <h2>CRD validation and versioning</h2>

      <p>A serious CRD includes three things:</p>

      <ul>
        <li><strong>An OpenAPI v3 schema</strong> — defines valid fields and their types, so the apiserver rejects malformed YAMLs.</li>
        <li><strong>Explicit versions</strong> — like built-in types, a CRD can have <code>v1alpha1</code>, <code>v1beta1</code>, <code>v1</code>. Only one version is the "storage" version (<code>storage: true</code>); the others are converted on the fly.</li>
        <li><strong>Subresources</strong> — <code>status</code> and <code>scale</code> as their own subresources, respecting the pattern that status is updated only by the controller.</li>
      </ul>

      <h2>CRDs vs API aggregation</h2>

      <p>There's a second way to extend the API: <em>API aggregation</em>, where you expose your own apiserver and the main apiserver delegates routes to it. More powerful but also more complex (you have to run and maintain an apiserver). For 99% of cases, a CRD is enough.</p>

      <p>For the KCNA it's enough to know that:</p>

      <ul>
        <li>CRDs are the primary way to extend the API.</li>
        <li>A CRD without a controller is functionally inert; it only stores data.</li>
        <li>CRD + controller = Operator.</li>
        <li>API aggregation also exists for advanced cases.</li>
      </ul>

      <p>In the next sub-part we drop down to the client side: how you work with all these objects from <code>kubectl</code>, and the difference between <code>apply</code>, <code>create</code>, <code>--dry-run</code>, and <em>server-side apply</em>.</p>
    `,
};
