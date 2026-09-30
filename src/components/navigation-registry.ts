import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  DollarSign,
  History,
  Home,
  Layers3,
  Leaf,
  MessageCircle,
  Package,
  PackageCheck,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Truck,
  UserCog,
  Users,
} from 'lucide-react';

export type NavigationLocale = 'en' | 'es';
type NavigationItemType = 'home' | 'destination';

export type NavigationDestination = {
  id: string;
  href: string;
  en: string;
  es: string;
  icon: LucideIcon;
  itemType: NavigationItemType;
  sidebar?: boolean;
  permissions: readonly string[];
  anyPermissions?: readonly string[];
  allowedRoles?: readonly string[];
  parent?: string;
  mobilePriority?: number;
  breadcrumb: { en: string; es: string };
  searchKeywords: readonly string[];
};

type NavigationSectionItem = {
  destinationId: string;
  active?: boolean;
};

export type NavigationSection = {
  id: string;
  en: string;
  es: string;
  icon: LucideIcon;
  itemIds: readonly NavigationSectionItem[];
};

export type NavigationBreadcrumbItem = {
  label: string;
  href?: string;
};

const purchasingPermissions = [
  'orders.read',
  'planning.read',
  'inventory.read',
  'products.read',
  'master_data.read',
] as const;

export const navigationDestinations: readonly NavigationDestination[] = [
  {
    id: 'dashboard',
    href: '/app',
    en: 'Dashboard',
    es: 'Panel',
    icon: Home,
    itemType: 'home',
    permissions: ['dashboard.read'],
    mobilePriority: 1,
    breadcrumb: { en: 'Dashboard', es: 'Panel' },
    searchKeywords: ['home', 'dashboard', 'panel'],
  },
  {
    id: 'orders',
    href: '/app/orders',
    en: 'Orders',
    es: 'Pedidos',
    icon: ClipboardList,
    itemType: 'destination',
    permissions: ['orders.read'],
    parent: 'orders-delivery',
    mobilePriority: 2,
    breadcrumb: { en: 'Orders', es: 'Pedidos' },
    searchKeywords: ['orders', 'customer orders', 'pedidos'],
  },
  {
    id: 'shipping',
    href: '/app/shipping',
    en: 'Shipping',
    es: 'Envíos',
    icon: Truck,
    itemType: 'destination',
    permissions: ['orders.read'],
    parent: 'orders-delivery',
    breadcrumb: { en: 'Shipping', es: 'Envíos' },
    searchKeywords: ['shipping', 'deliveries', 'envíos'],
  },
  {
    id: 'customers',
    href: '/app/customers',
    en: 'Customers',
    es: 'Clientes',
    icon: Users,
    itemType: 'destination',
    permissions: ['orders.read'],
    parent: 'orders-delivery',
    breadcrumb: { en: 'Customers', es: 'Clientes' },
    searchKeywords: ['customers', 'clientes'],
  },
  {
    id: 'inventory',
    href: '/app/inventory',
    en: 'Inventory',
    es: 'Inventario',
    icon: Package,
    itemType: 'destination',
    permissions: ['inventory.read'],
    parent: 'inventory',
    mobilePriority: 3,
    breadcrumb: { en: 'Inventory', es: 'Inventario' },
    searchKeywords: ['inventory', 'stock', 'inventario'],
  },
  {
    id: 'purchasing',
    href: '/app/purchasing',
    en: 'Purchase planning',
    es: 'Planificación de compras',
    icon: ShoppingBasket,
    itemType: 'destination',
    permissions: purchasingPermissions,
    parent: 'procurement',
    breadcrumb: { en: 'Purchase planning', es: 'Planificación de compras' },
    searchKeywords: ['purchasing', 'purchase planning', 'compras'],
  },
  {
    id: 'receiving',
    href: '/app/receiving',
    en: 'Receive deliveries',
    es: 'Recibir entregas',
    icon: PackageCheck,
    itemType: 'destination',
    permissions: ['inventory.read'],
    parent: 'procurement',
    breadcrumb: { en: 'Receive deliveries', es: 'Recibir entregas' },
    searchKeywords: ['receiving', 'deliveries', 'recibir'],
  },
  {
    id: 'traceability',
    href: '/app/traceability',
    en: 'Traceability',
    es: 'Trazabilidad',
    icon: Search,
    itemType: 'destination',
    permissions: ['inventory.read'],
    parent: 'inventory',
    breadcrumb: { en: 'Traceability', es: 'Trazabilidad' },
    searchKeywords: ['traceability', 'lots', 'trazabilidad'],
  },
  {
    id: 'suppliers',
    href: '/app/suppliers',
    en: 'Suppliers',
    es: 'Proveedores',
    icon: Truck,
    itemType: 'destination',
    permissions: ['master_data.read'],
    parent: 'procurement',
    breadcrumb: { en: 'Suppliers', es: 'Proveedores' },
    searchKeywords: ['suppliers', 'vendors', 'proveedores'],
  },
  {
    id: 'ingredients',
    href: '/app/ingredients',
    en: 'Ingredients',
    es: 'Ingredientes',
    icon: Leaf,
    itemType: 'destination',
    permissions: ['master_data.read'],
    parent: 'catalog',
    breadcrumb: { en: 'Ingredients', es: 'Ingredientes' },
    searchKeywords: ['ingredients', 'ingredientes'],
  },
  {
    id: 'products',
    href: '/app/products',
    en: 'Products',
    es: 'Productos',
    icon: Package,
    itemType: 'destination',
    permissions: ['products.read'],
    parent: 'catalog',
    breadcrumb: { en: 'Products', es: 'Productos' },
    searchKeywords: ['products', 'productos'],
  },
  {
    id: 'pricing',
    href: '/app/pricing',
    en: 'Pricing',
    es: 'Precios',
    icon: DollarSign,
    itemType: 'destination',
    permissions: [],
    anyPermissions: ['products.read', 'master_data.read'],
    parent: 'catalog',
    breadcrumb: { en: 'Pricing', es: 'Precios' },
    searchKeywords: ['pricing', 'price books', 'customer pricing', 'supplier pricing', 'precios'],
  },
  {
    id: 'allergens',
    href: '/app/allergens',
    en: 'Allergens',
    es: 'Alérgenos',
    icon: ShieldCheck,
    itemType: 'destination',
    permissions: ['master_data.read'],
    parent: 'catalog',
    breadcrumb: { en: 'Allergens', es: 'Alérgenos' },
    searchKeywords: ['allergens', 'allergen management', 'alérgenos'],
  },
  {
    id: 'recipes',
    href: '/app/recipes',
    en: 'Recipes',
    es: 'Recetas',
    icon: BookOpen,
    itemType: 'destination',
    permissions: ['products.read'],
    parent: 'catalog',
    breadcrumb: { en: 'Recipes', es: 'Recetas' },
    searchKeywords: ['recipes', 'recetas'],
  },
  {
    id: 'team',
    href: '/app/team',
    en: 'Team',
    es: 'Equipo',
    icon: Users,
    itemType: 'destination',
    permissions: ['workforce.read'],
    parent: 'planning-production',
    breadcrumb: { en: 'Team', es: 'Equipo' },
    searchKeywords: ['team', 'employees', 'equipo'],
  },
  {
    id: 'planning',
    href: '/app/planning',
    en: 'Production planning',
    es: 'Planificación de producción',
    icon: ClipboardList,
    itemType: 'destination',
    permissions: ['planning.read'],
    parent: 'planning-production',
    breadcrumb: { en: 'Production planning', es: 'Planificación de producción' },
    searchKeywords: ['production planning', 'demand coverage', 'planificación de producción'],
  },
  {
    id: 'scheduling',
    href: '/app/scheduling',
    en: 'Schedule',
    es: 'Calendario',
    icon: CalendarDays,
    itemType: 'destination',
    permissions: ['workforce.read'],
    parent: 'planning-production',
    breadcrumb: { en: 'Schedule', es: 'Calendario' },
    searchKeywords: ['schedule', 'calendar', 'calendario'],
  },
  {
    id: 'settings',
    href: '/app/settings',
    en: 'Settings',
    es: 'Configuración',
    icon: Settings,
    itemType: 'destination',
    permissions: ['settings.manage'],
    parent: 'administration',
    breadcrumb: { en: 'Settings', es: 'Configuración' },
    searchKeywords: ['settings', 'configuración'],
  },
  {
    id: 'users',
    href: '/app/user-management/users',
    en: 'Users',
    es: 'Usuarios',
    icon: Users,
    itemType: 'destination',
    permissions: ['access.manage'],
    parent: 'administration',
    breadcrumb: { en: 'Users', es: 'Usuarios' },
    searchKeywords: ['users', 'usuarios'],
  },
  {
    id: 'profiles',
    href: '/app/user-management/profiles',
    en: 'Profile Management',
    es: 'Administración de perfiles',
    icon: UserCog,
    itemType: 'destination',
    permissions: ['settings.manage'],
    parent: 'administration',
    breadcrumb: { en: 'Profile Management', es: 'Administración de perfiles' },
    searchKeywords: ['profiles', 'access profiles', 'perfiles'],
  },
  {
    id: 'access-requests',
    href: '/app/user-management/access-requests',
    en: 'Access Requests',
    es: 'Solicitudes de acceso',
    icon: ShieldCheck,
    itemType: 'destination',
    permissions: ['access.manage'],
    parent: 'administration',
    breadcrumb: { en: 'Access Requests', es: 'Solicitudes de acceso' },
    searchKeywords: ['access requests', 'solicitudes de acceso'],
  },
  {
    id: 'login-history',
    href: '/app/user-management/login-history',
    en: 'Login History',
    es: 'Historial de inicio de sesión',
    icon: History,
    itemType: 'destination',
    permissions: ['audit.read'],
    parent: 'administration',
    breadcrumb: { en: 'Login History', es: 'Historial de inicio de sesión' },
    searchKeywords: ['login history', 'audit', 'historial'],
  },
  {
    id: 'administration-copilot',
    href: '/app/administration-copilot',
    en: 'Administration Copilot',
    es: 'Copiloto de administración',
    icon: Sparkles,
    itemType: 'destination',
    permissions: ['access.manage'],
    parent: 'administration',
    breadcrumb: { en: 'Administration Copilot', es: 'Copiloto de administración' },
    searchKeywords: ['administration copilot', 'copiloto de administración'],
  },
  {
    id: 'feedback',
    href: '/app/feedback',
    en: 'Feedback',
    es: 'Comentarios',
    icon: MessageCircle,
    itemType: 'destination',
    permissions: [],
    parent: 'administration',
    breadcrumb: { en: 'Feedback', es: 'Comentarios' },
    searchKeywords: ['feedback', 'comments', 'comentarios'],
  },
];

export const navigationSections: readonly NavigationSection[] = [
  {
    id: 'orders-delivery',
    en: 'Customers & orders',
    es: 'Clientes y pedidos',
    icon: ClipboardList,
    itemIds: [
      { destinationId: 'orders' },
      { destinationId: 'shipping' },
      { destinationId: 'customers' },
    ],
  },
  {
    id: 'procurement',
    en: 'Purchasing & deliveries',
    es: 'Compras y entregas',
    icon: ShoppingBasket,
    itemIds: [
      { destinationId: 'purchasing' },
      { destinationId: 'receiving' },
      { destinationId: 'suppliers' },
    ],
  },
  {
    id: 'inventory',
    en: 'Inventory & traceability',
    es: 'Inventario y trazabilidad',
    icon: Package,
    itemIds: [
      { destinationId: 'inventory' },
      { destinationId: 'traceability' },
    ],
  },
  {
    id: 'catalog',
    en: 'Products & recipes',
    es: 'Productos y recetas',
    icon: Layers3,
    itemIds: [
      { destinationId: 'ingredients' },
      { destinationId: 'allergens' },
      { destinationId: 'products' },
      { destinationId: 'pricing' },
      { destinationId: 'recipes' },
    ],
  },
  {
    id: 'planning-production',
    en: 'Production & team',
    es: 'Producción y equipo',
    icon: CalendarDays,
    itemIds: [
      { destinationId: 'planning' },
      { destinationId: 'scheduling' },
      { destinationId: 'team' },
    ],
  },
  {
    id: 'administration',
    en: 'Administration',
    es: 'Administración',
    icon: Building2,
    itemIds: [
      { destinationId: 'settings' },
      { destinationId: 'users' },
      { destinationId: 'profiles' },
      { destinationId: 'access-requests' },
      { destinationId: 'login-history' },
      { destinationId: 'administration-copilot' },
      { destinationId: 'feedback' },
    ],
  },
];

export const legacyNavigationRoutes: Readonly<Record<string, string>> = {
  '/app/access-requests': '/app/user-management/access-requests',
};

const destinationById = new Map(
  navigationDestinations.map((destination) => [destination.id, destination]),
);

export function canonicalNavigationPath(path: string) {
  return legacyNavigationRoutes[path] ?? path;
}

export function navigationRegistryValidationErrors() {
  const errors: string[] = [];
  const destinationIds = navigationDestinations.map(({ id }) => id);
  const destinationPaths = navigationDestinations.map(({ href }) => href);
  const sectionIds = navigationSections.map(({ id }) => id);
  const referencedDestinationIds = navigationSections.flatMap(({ itemIds }) =>
    itemIds.map(({ destinationId }) => destinationId),
  );
  if (new Set(destinationIds).size !== destinationIds.length)
    errors.push('Destination IDs must be unique.');
  if (new Set(destinationPaths).size !== destinationPaths.length)
    errors.push('Destination paths must be unique.');
  if (new Set(sectionIds).size !== sectionIds.length) errors.push('Section IDs must be unique.');
  if (new Set(referencedDestinationIds).size !== referencedDestinationIds.length) {
    errors.push('Sidebar destinations must appear in only one section.');
  }
  navigationSections.forEach((section) => {
    section.itemIds.forEach(({ destinationId }) => {
      const destination = destinationById.get(destinationId);
      if (!destination) {
        errors.push(`Section ${section.id} references unknown destination ${destinationId}.`);
      } else if (destination.parent !== section.id) {
        errors.push(`Destination ${destinationId} must name ${section.id} as its parent.`);
      }
    });
  });
  navigationDestinations.forEach((destination) => {
    if (destination.parent && !sectionIds.includes(destination.parent)) {
      errors.push(`Destination ${destination.id} references unknown parent ${destination.parent}.`);
    }
    if (
      destination.sidebar !== false &&
      destination.itemType !== 'home' &&
      !referencedDestinationIds.includes(destination.id)
    ) {
      errors.push(`Sidebar destination ${destination.id} is not placed in a section.`);
    }
  });
  return errors;
}

const registryErrors = navigationRegistryValidationErrors();
if (registryErrors.length) {
  throw new Error(`Invalid navigation registry: ${registryErrors.join(' ')}`);
}

function getDestination(destinationId: string) {
  const destination = destinationById.get(destinationId);
  if (!destination) throw new Error(`Unknown navigation destination: ${destinationId}`);
  return destination;
}

export function navigationLabel(
  item: Pick<NavigationDestination, 'en' | 'es'>,
  locale: NavigationLocale,
) {
  return locale === 'es' ? item.es : item.en;
}

export function canViewNavigationDestination(
  destination: NavigationDestination,
  permissions: readonly string[],
) {
  return destination.permissions.every((permission) => permissions.includes(permission))
    && (!destination.anyPermissions
      || destination.anyPermissions.some((permission) => permissions.includes(permission)));
}

export function isNavigationDestinationCurrent(
  destination: Pick<NavigationDestination, 'href'>,
  path: string,
) {
  return (
    path === destination.href ||
    (destination.href !== '/app' && path.startsWith(`${destination.href}/`))
  );
}

export function getVisibleNavigationDestinations(permissions: readonly string[]) {
  return navigationDestinations.filter(
    (destination) =>
      destination.sidebar !== false && canViewNavigationDestination(destination, permissions),
  );
}

export function getSectionDestinations(section: NavigationSection) {
  return section.itemIds.map((item) => ({
    ...item,
    destination: getDestination(item.destinationId),
  }));
}

export function getVisibleSectionDestinations(
  section: NavigationSection,
  permissions: readonly string[],
) {
  return getSectionDestinations(section).filter(({ destination }) =>
    canViewNavigationDestination(destination, permissions),
  );
}

export function isNavigationSectionCurrent(
  section: NavigationSection,
  path: string,
  permissions: readonly string[],
) {
  return getVisibleSectionDestinations(section, permissions).some(
    ({ active, destination }) =>
      active !== false && isNavigationDestinationCurrent(destination, path),
  );
}

export function getMobileNavigationDestinations(permissions: readonly string[]) {
  return getVisibleNavigationDestinations(permissions)
    .filter((destination) => destination.mobilePriority !== undefined)
    .sort(
      (left, right) =>
        (left.mobilePriority ?? Number.MAX_SAFE_INTEGER) -
        (right.mobilePriority ?? Number.MAX_SAFE_INTEGER),
    );
}

export function getNavigationBreadcrumb(path: string, locale: NavigationLocale) {
  const destination = navigationDestinations
    .filter((candidate) => isNavigationDestinationCurrent(candidate, path))
    .sort((left, right) => right.href.length - left.href.length)[0];
  if (!destination) return undefined;
  const section = destination.parent
    ? navigationSections.find((candidate) => candidate.id === destination.parent)
    : undefined;
  return [
    {
      label: navigationLabel(getDestination('dashboard'), locale),
      ...(destination.id === 'dashboard' ? {} : { href: '/app' }),
    },
    ...(section ? [{ label: navigationLabel(section, locale) }] : []),
    ...(destination.id === 'dashboard'
      ? []
      : [{ label: navigationLabel(destination.breadcrumb, locale) }]),
  ];
}
