const queEsRealmenteUnContenedor = {
  id: 1,
  slug: 'que-es-realmente-un-contenedor',
  loadPart: (order) => import(`./part${order}.js`),
  title: {
    es: '¿Qué es realmente un contenedor?',
    en: 'What exactly is a Container?',
  },
  subtitle: {
    es: 'Construyendo un contenedor desde 0',
    en: 'Building a Container from Scratch',
  },
  description: {
    es: 'Desmontamos la ilusión capa por capa: namespaces, capabilities, chroot, pivot_root, OverlayFS y cgroups. Al final construimos un contenedor funcional con comandos del kernel, sin Docker.',
    en: 'We dismantle the illusion layer by layer: namespaces, capabilities, chroot, pivot_root, OverlayFS, and cgroups. By the end, we build a working container using kernel primitives — no Docker required.',
  },
  tags: ['linux', 'namespaces', 'cgroups', 'overlayfs', 'internals'],
  parts: [
    {
      order: 1,
      slug: 'introduccion',
      title: {
        es: 'Introducción: ¿qué es realmente un contenedor?',
        en: 'Introduction: What is a Container, Really?',
      },
    },
    {
      order: 2,
      slug: 'namespaces',
      title: {
        es: 'Linux Namespaces: los ocho tipos a fondo',
        en: 'Linux Namespaces: All Eight Types in Depth',
      },
    },
    {
      order: 3,
      slug: 'capabilities',
      title: {
        es: 'Linux Capabilities: rompiendo el binario root/no-root',
        en: 'Linux Capabilities: Breaking the root/non-root Binary',
      },
    },
    {
      order: 4,
      slug: 'chroot-pivot-root',
      title: {
        es: 'chroot y pivot_root: cambiando la raíz del filesystem',
        en: 'chroot and pivot_root: Changing the Filesystem Root',
      },
    },
    {
      order: 5,
      slug: 'overlayfs',
      title: {
        es: 'OverlayFS: el filesystem de capas de las imágenes',
        en: 'OverlayFS: The Layered Filesystem Behind Container Images',
      },
    },
    {
      order: 6,
      slug: 'cgroups',
      title: {
        es: 'cgroups: control real de recursos (v1 vs v2)',
        en: 'cgroups: Real Resource Control (v1 vs v2)',
      },
    },
    {
      order: 7,
      slug: 'construyendo-un-contenedor',
      title: {
        es: 'Construyendo un contenedor desde 0',
        en: 'Building a Container from Scratch',
      },
    },
    {
      order: 8,
      slug: 'container-runtime',
      title: {
        es: 'Lo que hace el container runtime',
        en: 'What the Container Runtime Does',
      },
    },
    {
      order: 9,
      slug: 'resumen',
      title: {
        es: 'Resumen de la serie',
        en: 'Series Summary',
      },
    },
  ],
}

export default queEsRealmenteUnContenedor
