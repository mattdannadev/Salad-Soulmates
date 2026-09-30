import { describe, expect, it } from 'vitest';
import {
  canonicalNavigationPath,
  getMobileNavigationDestinations,
  getNavigationBreadcrumb,
  getSectionDestinations,
  getVisibleSectionDestinations,
  isNavigationDestinationCurrent,
  isNavigationSectionCurrent,
  navigationDestinations,
  navigationRegistryValidationErrors,
  navigationSections,
} from '../src/components/navigation-registry';

describe('navigation registry', () => {
  it('keeps canonical destinations registered once', () => {
    const identifiers = navigationDestinations.map(({ id }) => id);
    const routes = navigationDestinations.map(({ href }) => href);

    expect(new Set(identifiers)).toHaveLength(identifiers.length);
    expect(new Set(routes)).toHaveLength(routes.length);
  });

  it('validates the registry and resolves legacy paths to their canonical destination', () => {
    expect(navigationRegistryValidationErrors()).toEqual([]);
    expect(canonicalNavigationPath('/app/access-requests')).toBe(
      '/app/user-management/access-requests',
    );
    expect(canonicalNavigationPath('/app/orders')).toBe('/app/orders');
  });

  it('has valid section references and no duplicate sidebar destinations', () => {
    const sidebarDestinationIds = navigationSections.flatMap((section) =>
      getSectionDestinations(section).map(({ destination }) => destination.id),
    );

    expect(new Set(sidebarDestinationIds)).toHaveLength(sidebarDestinationIds.length);
    expect(sidebarDestinationIds).toContain('purchasing');
    expect(sidebarDestinationIds).toContain('allergens');
  });

  it('orders customer-specific products and recipes before procurement work', () => {
    expect(navigationSections.map(({ id }) => id)).toEqual([
      'orders-delivery',
      'catalog',
      'procurement',
      'inventory',
      'planning-production',
      'administration',
    ]);
  });

  it('selects one canonical active destination for customer detail routes', () => {
    const customers = navigationDestinations.find(({ id }) => id === 'customers');
    const administration = navigationSections.find(({ id }) => id === 'administration');
    expect(customers).toBeDefined();
    expect(administration).toBeDefined();

    expect(isNavigationDestinationCurrent(customers!, '/app/customers/123')).toBe(true);
    expect(isNavigationSectionCurrent(administration!, '/app/customers/123', ['orders.read'])).toBe(
      false,
    );
  });

  it('derives localized breadcrumbs and mobile priorities from the registry', () => {
    expect(getNavigationBreadcrumb('/app/user-management/profiles', 'en')).toEqual([
      { label: 'Dashboard', href: '/app' },
      { label: 'Administration' },
      { label: 'Profile Management' },
    ]);
    expect(getNavigationBreadcrumb('/app/user-management/profiles', 'es')).toEqual([
      { label: 'Panel', href: '/app' },
      { label: 'Administración' },
      { label: 'Administración de perfiles' },
    ]);
    expect(
      getMobileNavigationDestinations(['dashboard.read', 'orders.read', 'inventory.read']).map(
        ({ id }) => id,
      ),
    ).toEqual(['dashboard', 'orders', 'inventory']);
  });

  it('keeps purchasing together with deliveries while preserving its breadcrumb', () => {
    const procurement = navigationSections.find(({ id }) => id === 'procurement');
    expect(procurement).toBeDefined();
    expect(
      getVisibleSectionDestinations(procurement!, [
        'orders.read',
        'planning.read',
        'inventory.read',
        'products.read',
        'master_data.read',
      ]).map(
        ({ destination }) => destination.id,
      ),
    ).toEqual(['purchasing', 'receiving', 'suppliers']);
    expect(getNavigationBreadcrumb('/app/purchasing', 'en')).toEqual([
      { label: 'Dashboard', href: '/app' },
      { label: 'Purchasing & deliveries' },
      { label: 'Purchase planning' },
    ]);
  });
});
