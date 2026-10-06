import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/** Exercise the installed browser bundle independently of auth/database fixtures. */
test('Gantt supports contextual work-order creation through its native cell menu', async ({ page }) => {
  const surface = await readFile('src/components/scheduling/bryntum-gantt-trial-surface.tsx', 'utf8');
  expect(surface).not.toContain('scheduleMenuFeature=');
  expect(surface).toContain('taskMenuFeature=');
  expect(surface).toContain("text: es ? 'Crear orden de trabajo' : 'Create Work Order'");
  expect(surface).toContain('creationResourceId: resource.id');
  expect(surface).toContain("taskId.startsWith('order:')");
  expect(surface).toContain("taskRecord.get('creationResourceId')");
  expect(surface).toContain('project={project}');
  expect(surface).toContain('project.loadInlineData({');
  expect(surface).not.toContain('tasks={tasks}');
  expect(surface).not.toContain('gantt.taskStore.data = tasks');
  expect(surface).not.toContain(['$', '{startDate}:$', '{endDate}:$', '{resetVersion}'].join(''));
  await page.route('http://gantt-runtime.test/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/gantt.js' || pathname === '/gantt.css') {
      await route.fulfill({
        path: `node_modules/@bryntum/gantt/${pathname === '/gantt.js' ? 'gantt.module.js' : 'gantt.css'}`,
        contentType: pathname.endsWith('.js') ? 'text/javascript' : 'text/css',
      });
      return;
    }
    await route.fulfill({
      contentType: 'text/html',
      body: '<html><head><link rel="stylesheet" href="/gantt.css"></head><body><div id="gantt"></div></body></html>',
    });
  });
  await page.goto('http://gantt-runtime.test/');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addScriptTag({
    type: 'module', content: `
    import { Gantt } from '/gantt.js';
    const gantt = new Gantt({
      appendTo: 'gantt', height: 500, width: 1100,
      startDate: '2026-10-01', endDate: '2026-10-08',
      infiniteScroll: false, autoAdjustTimeAxis: false,
      tasks: [{ id: 'work', name: 'Work', startDate: '2026-10-01', endDate: '2026-10-02' }],
      columns: [{ type: 'name', width: 200 }],
      features: {
        taskMenu: {
          processItems: ({ event, column, targetElement, items }) => {
            if (targetElement.closest('.b-gantt-task-wrap')) {
              items.deleteTask = false;
              items.deleteWork = { text: 'Delete', onItem: () => {
                document.body.dataset.deletedWork = 'work';
              }};
              return;
            }
            if (column?.region !== 'normal') return;
            const date = gantt.getDateFromDomEvent(event, 'floor');
            Object.keys(items).forEach((key) => { items[key] = false; });
            items.addWork = { text: 'Create Work Order', onItem: () => {
              document.body.dataset.createdDate = date.toISOString();
            }};
          }
        }
      }
    });
    window.testGantt = gantt;
    gantt.timeAxisSubGrid.scrollable.scrollBy(100000, 0, { animate: false }).then(() => {
      document.body.dataset.axisStart = gantt.startDate.toISOString().slice(0, 10);
      document.body.dataset.axisEnd = gantt.endDate.toISOString().slice(0, 10);
    });
  `,
  });
  await expect(page.locator('.b-gantt')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-axis-start', '2026-10-01');
  await expect(page.locator('body')).toHaveAttribute('data-axis-end', '2026-10-08');
  await page.locator('.b-gantt-task').first().click({ button: 'right' });
  await page.getByText('Delete', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-deleted-work', 'work');
  const cell = page.getByRole('gridcell').nth(1);
  const bounds = await cell.boundingBox();
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('Gantt timeline cell has no bounds');
  await cell.click({ button: 'right', position: { x: bounds.width - 30, y: 10 } });
  await page.getByText('Create Work Order', { exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-created-date', /^2026-10-\d{2}T/);
  expect(errors).toEqual([]);
  await page.addScriptTag({
    type: 'module', content: `
    import { Gantt, ProjectModel } from '/gantt.js';
    window.testGantt.destroy();
    try {
    const taskData = () => [{ id: 'customer', name: 'Customer', expanded: true,
      children: [{ id: 'order', name: 'Order', expanded: true,
        children: Array.from({ length: 40 }, (_, index) => ({
          id: 'work-' + index, name: 'Work ' + index,
          startDate: '2026-10-01', endDate: '2026-10-02', manuallyScheduled: true
        }))
      }]
    }];
    const project = new ProjectModel({
      taskStore: { syncDataOnLoad: true },
      dependencyStore: { syncDataOnLoad: true },
      tasksData: taskData(),
      dependenciesData: []
    });
    const gantt = new Gantt({ appendTo: 'gantt', height: 500, width: 1100,
      startDate: '2026-09-21', endDate: '2027-01-05',
      infiniteScroll: false, autoAdjustTimeAxis: false,
      viewPreset: { base: 'dayAndWeek', tickWidth: 130 },
      project,
      columns: [{ type: 'name', width: 200 }],
      taskRenderer: ({ taskRecord }) => taskRecord.name
    });
    await gantt.project.commitAsync();
    gantt.selectRow('work-24');
    gantt.timeAxisSubGrid.scrollable.x = 700;
    gantt.scrollable.y = 350;
    const oldOrder = gantt.taskStore.getById('order');
    const beforeX = gantt.timeAxisSubGrid.scrollable.x;
    const beforeY = gantt.scrollable.y;
    const syncTasks = async data => {
      const x = gantt.timeAxisSubGrid.scrollable.x;
      const y = gantt.scrollable.y;
      const selected = gantt.selectedRecords.map(record => record.id);
      await project.loadInlineData({ tasksData: data, dependenciesData: [] });
      await project.commitAsync();
      gantt.selectRows(selected.filter(id => gantt.taskStore.getById(id)));
      gantt.timeAxisSubGrid.scrollable.x = x;
      gantt.scrollable.y = y;
    };
    const addedTasks = taskData();
    addedTasks[0].children[0].children.push({ id: 'work-40', name: 'Work 40',
      startDate: '2026-10-02', endDate: '2026-10-03', manuallyScheduled: true });
    await syncTasks(addedTasks);
    const addStable = Boolean(gantt.taskStore.getById('work-40'));
    const movedTasks = taskData();
    movedTasks[0].children[0].children.push({ id: 'work-40', name: 'Work 40',
      startDate: '2026-10-02', endDate: '2026-10-03', manuallyScheduled: true });
    Object.assign(movedTasks[0].children[0].children[24], {
      name: 'Moved Work 24', startDate: '2026-10-04', endDate: '2026-10-05'
    });
    await syncTasks(movedTasks);
    const moved = gantt.taskStore.getById('work-24');
    const moveStable = moved.name === 'Moved Work 24'
      && moved.startDate.toISOString().slice(0, 10) === '2026-10-04';
    const deletedTasks = movedTasks;
    deletedTasks[0].children[0].children = deletedTasks[0].children[0].children
      .filter(task => task.id !== 'work-25');
    await syncTasks(deletedTasks);
    document.body.dataset.inPlaceMutations = JSON.stringify({
      added: addStable,
      moved: moveStable,
      removed: !gantt.taskStore.getById('work-25'),
      sameOrder: oldOrder === gantt.taskStore.getById('order'),
      parent: gantt.taskStore.getById('work-24').parent.id,
      expanded: gantt.taskStore.getById('order').expanded,
      selected: gantt.selectedRecords.some(record => record.id === 'work-24'),
      labels: Array.from(document.querySelectorAll('.b-gantt-task'))
        .some(element => element.textContent.trim().length > 0),
      x: gantt.timeAxisSubGrid.scrollable.x === beforeX,
      y: gantt.scrollable.y === beforeY
    });
    } catch (error) { document.body.dataset.inPlaceMutations = String(error); }
    `,
  });
  await expect(page.locator('body')).toHaveAttribute('data-in-place-mutations', JSON.stringify({
    added: true,
    moved: true,
    removed: true,
    sameOrder: true,
    parent: 'order',
    expanded: true,
    selected: true,
    labels: true,
    x: true,
    y: true,
  }));
});
