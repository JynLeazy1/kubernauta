export default {
  es: `
      <div class="callout callout-note">
        <span class="callout-label">Nota sobre el idioma</span>
        <p>La gran mayoría de los recursos de Kubernetes — la documentación oficial, el material de la CNCF, el examen KCNA y las discusiones de la comunidad — están en inglés. Para que lo que aprendas aquí se traslade sin fricción a esas fuentes, <strong>los términos técnicos se mantienen en inglés</strong>: <code>control plane</code>, <code>worker node</code>, <code>kubelet</code>, <code>Pod</code>, <code>Service</code>, <code>Deployment</code>, etc. La prosa alrededor va en español, pero los nombres oficiales no se traducen.</p>
      </div>

      <p>Ya sé, otro curso de Kubernetes (de los que parecen tediosamente largos y con mucho texto). Este también lo es — el reto está en que no se sienta así. Nos quedamos en los conceptos básicos, los explicamos lo más simple posible, y los acompañamos con humor, ejemplos y analogías. No es la documentación oficial; es una guía para entender qué hace cada pieza sin perder el camino. Vamos a zarpar en este viaje — <em>fun fact</em>: <code>kubernetes</code> viene del griego <em>κυβερνήτης</em> (timonel, piloto, de ahí también la palabra "gobernar"); en esta página lo adaptamos a <em>Kubernauta</em>, algo así como "el que navega Kubernetes".</p>

      <p>Si abres la documentación de K8s, lo primero que vas a ver es un diagrama de cómo está estructurado el cluster. Si nunca habías oído hablar de Kubernetes — ¿cómo llegaste hasta acá? — o solo lo conoces de nombre como un <em>orquestador de contenedores</em>, ese diagrama probablemente no te diga gran cosa: aparecen <code>kube-proxy</code>, <code>kubelet</code>, <code>kube-apiserver</code> y otros nombres extraños, sin pista de para qué sirven o con qué se comen. En este primer capítulo es justo lo que vamos a desarmar.</p>

      <h2>¿Qué es un cluster?</h2>

      <p>Un cluster, simplemente, es un conjunto de computadoras o máquinas, ya sean físicas o virtuales, unidas para cumplir un objetivo en común. A cada una le llamaremos nodo. En el caso de Kubernetes, esos nodos corren Linux, y su objetivo es gestionar las aplicaciones que despliegues sobre él. Para lograrlo, los nodos se dividen básicamente en dos tipos: los del <code>control plane</code>, que son quienes deciden qué pasa, y los <code>worker nodes</code>, que son quienes corren tus aplicaciones.</p>

      <figure>
        <img
          src="https://kubernetes.io/images/docs/components-of-kubernetes.svg"
          alt="Diagrama de los componentes de un cluster de Kubernetes: control plane (kube-apiserver, etcd, kube-scheduler, kube-controller-manager, cloud-controller-manager) y worker nodes (kubelet, kube-proxy, container runtime)."
        />
        <figcaption>
          Componentes de un cluster de Kubernetes. Fuente: <a href="https://kubernetes.io/docs/concepts/overview/components/" target="_blank" rel="noopener noreferrer">kubernetes.io — Cluster Components</a>.
        </figcaption>
      </figure>

      <p>Lo curioso es que el cluster se ve como una sola entidad. Si no lo conoces, podrías pensar que es como cualquier otra aplicación que instalas con <code>apt install</code>. En realidad es un conjunto de componentes, y cada uno necesita su propia instalación para funcionar.</p>

      <h2>Los componentes del cluster</h2>

      <p>Como mencionamos antes, el cluster tiene dos tipos de nodos: los del tipo <code>control plane</code> y los del tipo <code>worker node</code>. Cada tipo se arma con sus propios componentes — pequeños procesos que, en conjunto, hacen que el cluster funcione.</p>

      <p>En el control plane están <code>kube-apiserver</code>, <code>etcd</code>, <code>kube-scheduler</code> y <code>kube-controller-manager</code>. Si el cluster vive en una nube (AWS, GCP, Azure), se suma un quinto invitado: el <code>cloud-controller-manager</code>, que habla con la API del proveedor para pedir cosas como balanceadores y volúmenes.</p>

      <p>Del lado de los worker nodes la lista es más corta: <code>kubelet</code>, un <em>container runtime</em> y <code>kube-proxy</code>.</p>

      <div class="callout callout-note">
        <span class="callout-label">Profundizar</span>
        <p>El rol de <code>kube-proxy</code>, las reglas que programa en el kernel y el camino completo de un paquete los cubrimos a fondo en el tutorial <a href="/tutorial/que-es-un-servicio">¿Qué es un Service?</a>.</p>
      </div>

      <h2>Lo que vamos a ver en este capítulo</h2>

      <ol>
        <li><strong>El <code>control plane</code> a fondo</strong>: <code>kube-apiserver</code>, <code>etcd</code>, <code>kube-scheduler</code> y <code>kube-controller-manager</code> — qué hace cada uno y por qué están separados.</li>
        <li><strong>Los <code>worker nodes</code> a fondo</strong>: <code>kubelet</code>, el <em>container runtime</em> y <code>kube-proxy</code> — cómo una máquina Linux se convierte en un nodo del cluster.</li>
        <li><strong>El flujo completo</strong>: qué pasa exactamente entre que tecleas <code>kubectl apply</code> y tu contenedor empieza a correr.</li>
        <li><strong><code>etcd</code></strong>: la base de datos que guarda todo el estado, y por qué es el corazón (y el talón de Aquiles) del cluster.</li>
        <li><strong>Alta disponibilidad</strong>: por qué el <code>control plane</code> no puede ser una sola máquina si quieres dormir tranquilo.</li>
      </ol>

      <p>Al terminar, cuando veas un diagrama de arquitectura de Kubernetes, no vas a ver un dibujo: vas a ver componentes, conexiones HTTP y un bucle de reconciliación trabajando. Y eso, en buena parte, es el examen KCNA: saber qué hace cada pieza y por qué está ahí.</p>

      <p>Si quieres la referencia oficial mientras avanzamos, tenla a mano: <a href="https://kubernetes.io/docs/concepts/overview/components/" target="_blank" rel="noopener noreferrer">Cluster Components — kubernetes.io</a>.</p>
    `,
  en: `
      <p>Yeah, yet another Kubernetes course (the kind that looks tediously long and packed with text). This one is too — the challenge is making it not feel that way. We stick to the basics, explain them as simply as possible, and lean on humor, examples, and analogies. It's not the official documentation; it's a guide to actually understand what each piece does without losing the thread. So let's set sail on this journey — <em>fun fact</em>: <code>kubernetes</code> comes from the Greek <em>κυβερνήτης</em> (helmsman, pilot — also the root of the word "govern"); on this site we adapted it as <em>Kubernauta</em>, roughly "the one who sails Kubernetes".</p>

      <p>If you open the K8s docs, the first thing you'll see is a diagram of how the cluster is structured. If you'd never heard of Kubernetes — how did you even land here? — or only know it by name as a <em>container orchestrator</em>, that diagram probably won't say much: there are <code>kube-proxy</code>, <code>kubelet</code>, <code>kube-apiserver</code> and other strange names, with no hint of what they do or what they're for. This first chapter is exactly what we'll unpack.</p>

      <h2>What is a cluster?</h2>

      <p>A cluster is, simply, a set of machines — physical or virtual — brought together for a common goal. We'll call each one a node. In Kubernetes, those nodes run Linux, and the group's job is to manage the applications you deploy on it. To pull that off, the nodes are basically split into two types: <code>control plane</code> nodes, which decide what happens, and <code>worker nodes</code>, which run your applications.</p>

      <figure>
        <img
          src="https://kubernetes.io/images/docs/components-of-kubernetes.svg"
          alt="Diagram of the components of a Kubernetes cluster: control plane (kube-apiserver, etcd, kube-scheduler, kube-controller-manager, cloud-controller-manager) and worker nodes (kubelet, kube-proxy, container runtime)."
        />
        <figcaption>
          Components of a Kubernetes cluster. Source: <a href="https://kubernetes.io/docs/concepts/overview/components/" target="_blank" rel="noopener noreferrer">kubernetes.io — Cluster Components</a>.
        </figcaption>
      </figure>

      <p>The curious thing is that the cluster looks like a single entity. If you've never seen it before, you might think it's like any other application you install with <code>apt install</code>. In reality it's a set of components, and each one needs its own installation to work.</p>

      <h2>The components of the cluster</h2>

      <p>As we mentioned before, the cluster has two types of nodes: <code>control plane</code> nodes and <code>worker nodes</code>. Each type is built from its own components — small processes that, together, keep the cluster running.</p>

      <p>In the control plane you'll find <code>kube-apiserver</code>, <code>etcd</code>, <code>kube-scheduler</code>, and <code>kube-controller-manager</code>. If the cluster lives on a cloud (AWS, GCP, Azure), a fifth guest joins in: the <code>cloud-controller-manager</code>, which talks to the provider's API to request things like load balancers and volumes.</p>

      <p>On the worker side the list is shorter: <code>kubelet</code>, a <em>container runtime</em>, and <code>kube-proxy</code>.</p>

      <div class="callout callout-note">
        <span class="callout-label">Deep dive</span>
        <p>The role of <code>kube-proxy</code>, the rules it programs in the kernel, and the full path of a packet are covered in depth in the tutorial <a href="/tutorial/que-es-un-servicio">What is a Service?</a>.</p>
      </div>

      <h2>What we'll cover in this chapter</h2>

      <ol>
        <li><strong>The <code>control plane</code> in depth</strong>: <code>kube-apiserver</code>, <code>etcd</code>, <code>kube-scheduler</code>, and <code>kube-controller-manager</code> — what each one does and why they're separate.</li>
        <li><strong><code>Worker nodes</code> in depth</strong>: <code>kubelet</code>, the <em>container runtime</em>, and <code>kube-proxy</code> — how a Linux machine becomes a node in the cluster.</li>
        <li><strong>The full flow</strong>: what exactly happens between typing <code>kubectl apply</code> and your container starting.</li>
        <li><strong>etcd</strong>: the database that stores all the state, and why it is the heart (and the Achilles' heel) of the cluster.</li>
        <li><strong>High availability</strong>: why the control plane cannot be a single machine if you want to sleep at night.</li>
      </ol>

      <p>By the end, when you see a Kubernetes architecture diagram, you won't see a drawing: you'll see components, HTTP connections, and a reconciliation loop at work. And that, in large part, is what the KCNA exam is about: knowing what each piece does and why it's there.</p>

      <p>If you want the official reference handy as we go, keep this one open: <a href="https://kubernetes.io/docs/concepts/overview/components/" target="_blank" rel="noopener noreferrer">Cluster Components — kubernetes.io</a>.</p>
    `,
}
