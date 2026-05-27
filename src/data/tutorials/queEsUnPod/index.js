const queEsUnPod = {
  id: 2,
  slug: "que-es-un-pod",
  loadPart: (order) => import(`./part${order}.js`),
  title: {
    es: "¿Qué es un Pod?",
    en: "What is a Pod?",
  },
  subtitle: {
    es: "La unidad mínima de Kubernetes desde adentro",
    en: "Kubernetes' Smallest Unit from the Inside Out",
  },
  description: {
    es: "Un Pod no es un contenedor. Es una abstracción que agrupa uno o más contenedores que comparten namespaces de red y almacenamiento. Entendemos su anatomía, el contenedor pause, el ciclo de vida y cómo kubelet lo levanta realmente.",
    en: "A Pod is not a container. It is an abstraction that groups one or more containers sharing network and storage namespaces. We dissect its anatomy, the pause container, the lifecycle, and how kubelet actually brings it up.",
  },
  tags: ["kubernetes", "pods", "kubelet", "networking", "internals"],
  parts: [
    {
      order: 1,
      slug: "introduccion",
      title: {
        es: "Introducción: un Pod no es un contenedor",
        en: "Introduction: A Pod Is Not a Container",
      },
    },
    {
      order: 2,
      slug: "el-problema",
      title: {
        es: "El problema que un Pod resuelve",
        en: "The Problem a Pod Solves",
      },
    },
    {
      order: 3,
      slug: "el-contenedor-pause",
      title: {
        es: "El contenedor pause: el ancla de los namespaces del Pod",
        en: "The pause Container: The Anchor of the Pod's Namespaces",
      },
    },
    {
      order: 4,
      slug: "como-kubelet-crea-un-pod",
      title: {
        es: "Cómo kubelet crea un Pod paso a paso",
        en: "How kubelet Creates a Pod Step by Step",
      },
    },
    {
      order: 5,
      slug: "cni-la-ip-del-pod",
      title: {
        es: "CNI: cómo el Pod obtiene su IP",
        en: "CNI: How the Pod Gets Its IP",
      },
    },
    {
      order: 6,
      slug: "anatomia-del-spec",
      title: {
        es: "Anatomía del spec: el YAML como instrucciones al kernel",
        en: "Spec Anatomy: YAML as Kernel Instructions",
      },
    },
    {
      order: 7,
      slug: "pods-multi-contenedor",
      title: {
        es: "Pods multi-contenedor: sidecars e init containers",
        en: "Multi-Container Pods: Sidecars and Init Containers",
      },
    },
    {
      order: 8,
      slug: "ciclo-de-vida",
      title: {
        es: "Ciclo de vida: fases, probes y restartPolicy",
        en: "Lifecycle: Phases, Probes, and restartPolicy",
      },
    },
    {
      order: 9,
      slug: "como-crear-un-pod-desde-0",
      title: {
        es: "Cómo crear un Pod desde 0",
        en: "How to Create a Pod from Scratch",
      },
    },
    {
      order: 10,
      slug: "resumen",
      title: {
        es: "Resumen: el mapa completo",
        en: "Summary: The Complete Map",
      },
    },
  ],
};

export default queEsUnPod;
