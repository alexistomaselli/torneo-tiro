/* ═══════════════════════════════════════════════
   app.js — Contabilidad del Torneo (Tesorero)
   ═══════════════════════════════════════════════ */

const state = {
  activeTab: 'summary',
  movements: [],
  teams: [],
  tournament: null,
  movementsEditEnabled: false,
  currentHistorialSubtab: 'list',
  currentChartMode: 'paid', // 'paid' or 'pending',
  currentTournamentId: 4, // Default to Torneo Largo 2 (Clausura)
  currentTournamentType: 'todos_contra_todos',
  selectedPhaseId: '3', // Default to Clausura 2026 phase
  phasesLoaded: false,
  currentFilter: 'all',
  currentTeamFilter: 'all',
  pendingDeleteId: null,
  pendingDeleteType: null, // 'movement', 'match', 'player'
  pendingDeleteExtra: null, // for player (teamId)
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  initDefaults();
  bindEvents();
  refreshAll();
  updateFooterTime();
});

/* ── ELEMENT CACHE ── */
function cacheElements() {
  [
    'appStatus', 'balanceValue', 'balanceNote', 'incomeValue',
    'expenseValue', 'movementCountValue', 'movementForm',
    'teamsList', 'movementsTbody', 'refreshBtn', 'toastContainer',
    'formError', 'submitBtn', 'typeToggle', 'categorySelect',
    'categoryCustomInput', 'methodSelect', 'methodCustomInput',
    'movCountBadge', 'deleteModal', 'deleteModalBackdrop',
    'deleteConfirm', 'deleteCancel', 'footerTime', 'globalPhaseSelect',
    // Tournament
    'tournamentName', 'budgetValue', 'pendingValue',
    'collectionProgressBar', 'collectionProgressPct',
    'tournamentForm', 'tournamentFormError',
    'tournamentNameInput', 'tournamentBudgetInput',
    'tournamentStartInput', 'tournamentNotesInput',
    // Tournament KPI panel
    't-budgetValue', 't-incomeValue', 't-expenseValue',
    't-pendingValue', 't-progressPct', 't-progressBar',
    // Planteles
    'plantelesTeamSelector', 'plantelesEmptyState', 'plantelesActiveState',
    'plantelesActiveTeamName', 'plantelesPlayerCount', 'plantelesTableBody',
    'addPlantelPlayerForm', 'addPlantelTeamId',
    'deleteModalTitle', 'deleteModalDesc', 'exportPdfBtn', 'btnExportFixturePdf',
    'cancelEditBtn', 'submitBtnText', 'teamFilterSelect', 'movementsEditToggle', 'fixtureSubNav',
    // Stats & Report
    'statsStandingsTbody', 'statsScorersTbody', 'statsCardsTbody', 'statsSuspendedTbody',
    'statsResultsRoundSelect', 'statsResultsContainerTbody',
    'btnExportStatsPdf', 'modalStatsPdf', 'selectReportFecha',
    'btnCancelReport', 'btnGenerateReportPdf', 'statsSimulateDeduction',
    'tournamentPhaseSelect', 'statsZonesContainer', 'statsZoneATbody', 'statsZoneBTbody', 'statsStandingsContainer',
    // Edit Player Modal
    'editPlayerModal', 'editPlayerModalBackdrop', 'editPlayerForm', 'editPlayerCancel',
    'editPlayerId', 'editPlayerTeamId', 'editPlayerName', 'editPlayerNumber',
    'editPlayerDni', 'editPlayerPosition',
    // Jugadores Management View
    'btnAddNewPlayer', 'playerSearchInput', 'playerTeamFilterSelect', 'playersManagementTbody', 'playerCountBadge',
    // Player History Modal
    'playerHistoryModal', 'playerHistoryModalBackdrop', 'closePlayerHistoryBtn',
    'phTeamShield', 'phPlayerName', 'phTeamName', 'phTotalCards', 'phTimelineContainer',
    // Historial sub-tabs
    'historial-subtab-list', 'historial-subtab-chart', 'historial-list-view', 'historial-chart-view',
    'chart-toggle-paid', 'chart-toggle-pending', 'chartAvailableMoney', 'chartPendingCollection', 'chartPendingPayments',
    'summaryPaidList', 'summaryPendingList', 'summaryGeneralStats', 'summaryPaidTotal', 'summaryPendingTotal'
  ].forEach(id => { if (document.getElementById(id)) els[id] = document.getElementById(id); });
}

/* ── INIT ── */
function initDefaults() {
  const dateInput = els.movementForm?.elements?.date;
  if (dateInput && !dateInput.value) {
    dateInput.value = toISODate(new Date());
  }
}

function updateFooterTime() {
  if (!els.footerTime) return;
  els.footerTime.textContent = new Date().toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── EVENTS ── */
function bindEvents() {
  // Tabs
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
      if (btn.dataset.tab === 'fixture' && !fixture.phases.length) {
        loadFixture();
      }
    });
  });

  // Global Phase Select
  if (els.globalPhaseSelect) {
    els.globalPhaseSelect.value = state.selectedPhaseId || '3';
    els.globalPhaseSelect.addEventListener('change', (e) => {
      state.selectedPhaseId = e.target.value;
      if (state.selectedPhaseId === '1') {
        state.currentTournamentId = 1;
      } else if (state.selectedPhaseId === '3') {
        state.currentTournamentId = 4;
      } else if (state.selectedPhaseId === 'all') {
        state.currentTournamentId = 'all';
      }
      if (els.tournamentPhaseSelect) {
        els.tournamentPhaseSelect.value = state.currentTournamentId;
      }
      if (state.selectedPhaseId !== 'all') {
        fixture.currentPhaseId = Number(state.selectedPhaseId);
      }
      refreshAll();
      if (state.activeTab === 'estadisticas') {
        renderStatsView();
      } else if (state.activeTab === 'fixture') {
        loadFixture();
      }
    });
  }

  // Fixture sub-nav
  bindFixtureEvents();

  // Movement form
  els.movementForm.addEventListener('submit', handleMovementSubmit);

  // Tournament form
  if (els.tournamentForm) {
    els.tournamentForm.addEventListener('submit', handleTournamentSave);
  }

  // Planteles Form
  if (els.addPlantelPlayerForm) {
    els.addPlantelPlayerForm.addEventListener('submit', handleAddPlantelPlayer);
  }

  // Stats Report PDF
  if (els.btnExportStatsPdf) {
    els.btnExportStatsPdf.addEventListener('click', openStatsReportModal);
  }
  if (els.btnExportFixturePdf) {
    els.btnExportFixturePdf.addEventListener('click', exportFixturePdf);
  }
  if (els.btnCancelReport) {
    els.btnCancelReport.addEventListener('click', () => els.modalStatsPdf.classList.add('hidden'));
  }
  if (els.btnGenerateReportPdf) {
    els.btnGenerateReportPdf.addEventListener('click', generateStatsReport);
  }

  // Stats Simulate Deduction
  if (els.statsSimulateDeduction) {
    els.statsSimulateDeduction.addEventListener('change', () => {
      renderEstadisticas();
    });
  }

  // Stats Tournament Selector
  if (els.tournamentPhaseSelect) {
    els.tournamentPhaseSelect.addEventListener('change', (e) => {
      const selectedOpt = e.target.options[e.target.selectedIndex];
      if (!selectedOpt) return;
      state.currentTournamentId = e.target.value === 'all' ? 'all' : Number(e.target.value);
      state.currentTournamentType = selectedOpt.dataset.type;

      // Reset round select to force regeneration for the new tournament
      if (els.statsResultsRoundSelect) {
        els.statsResultsRoundSelect.innerHTML = '';
      }

      renderEstadisticas();
    });
  }

  // Historial de Tarjetas Modal
  const closeHistoryModalFn = () => {
    if (els.playerHistoryModal) els.playerHistoryModal.classList.add('hidden');
  };

  if (els.closePlayerHistoryBtn) {
    els.closePlayerHistoryBtn.addEventListener('click', closeHistoryModalFn);
  }
  if (els.playerHistoryModalBackdrop) {
    els.playerHistoryModalBackdrop.addEventListener('click', closeHistoryModalFn);
  }

  // Global ESC Key to close modals / shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (els.playerHistoryModal && !els.playerHistoryModal.classList.contains('hidden')) {
        closeHistoryModalFn();
      }
      if (els.editPlayerModal && !els.editPlayerModal.classList.contains('hidden')) {
        els.editPlayerModal.classList.add('hidden');
      }
      if (els.deleteModal && !els.deleteModal.classList.contains('hidden')) {
        els.deleteModal.classList.add('hidden');
      }
      if (els.modalStatsPdf && !els.modalStatsPdf.classList.contains('hidden')) {
        els.modalStatsPdf.classList.add('hidden');
      }
    }

    // Toggle movements edit mode shortcut: 'e' / 'E' (outside typing) or Alt + E / Option + E
    const isEditingField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    const isAltE = e.altKey && e.key.toLowerCase() === 'e';
    const isSimpleE = !isEditingField && e.key.toLowerCase() === 'e';
    if (isAltE || isSimpleE) {
      e.preventDefault();
      toggleMovementsEditMode();
    }
  });

  // Movements edit toggle change event
  if (els.movementsEditToggle) {
    els.movementsEditToggle.checked = state.movementsEditEnabled;
    els.movementsEditToggle.addEventListener('change', (e) => {
      toggleMovementsEditMode(e.target.checked);
    });
  }

  // Edit Player Modal Events
  if (els.editPlayerCancel) {
    els.editPlayerCancel.addEventListener('click', () => els.editPlayerModal.classList.add('hidden'));
  }
  if (els.editPlayerModalBackdrop) {
    els.editPlayerModalBackdrop.addEventListener('click', () => els.editPlayerModal.classList.add('hidden'));
  }
  if (els.editPlayerForm) {
    els.editPlayerForm.addEventListener('submit', handleEditPlayerSubmit);
  }

  // Stats Results Round Select
  if (els.statsResultsRoundSelect) {
    els.statsResultsRoundSelect.addEventListener('change', () => {
      renderResultsByDate(els.statsResultsRoundSelect.value);
    });
  }

  // Type toggle
  if (els.typeToggle) {
    els.typeToggle.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => setType(btn.dataset.type));
    });
  }

  // Select → custom input for category
  if (els.categorySelect) {
    els.categorySelect.addEventListener('change', () => {
      const isOther = els.categorySelect.value === '__otro__';
      els.categoryCustomInput.classList.toggle('hidden', !isOther);
      if (isOther) els.categoryCustomInput.focus();
    });
  }

  // Select → custom input for method
  if (els.methodSelect) {
    els.methodSelect.addEventListener('change', () => {
      const isOther = els.methodSelect.value === '__otro__';
      els.methodCustomInput.classList.toggle('hidden', !isOther);
      if (isOther) els.methodCustomInput.focus();
    });
  }

  // Refresh button
  if (els.refreshBtn) {
    els.refreshBtn.addEventListener('click', refreshAll);
  }

  // Export PDF
  if (els.exportPdfBtn) {
    els.exportPdfBtn.addEventListener('click', () => {
      const activeFilterText = document.querySelector('.filter-btn--active')?.textContent || 'Todos';
      const originalTitle = document.title;
      document.title = `Reporte Movimientos - ${state.summary?.tournament?.name || 'Torneo'} - ${activeFilterText}`;
      window.print();
      document.title = originalTitle;
    });
  }

  // Filter buttons
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => setFilter(btn.dataset.filter));
  });

  // Team Filter Select
  if (els.teamFilterSelect) {
    els.teamFilterSelect.addEventListener('change', () => {
      state.currentTeamFilter = els.teamFilterSelect.value;
      renderMovements();
    });
  }

  // Historial sub-tabs
  if (els['historial-subtab-list']) {
    els['historial-subtab-list'].addEventListener('click', () => switchHistorialSubtab('list'));
  }
  if (els['historial-subtab-chart']) {
    els['historial-subtab-chart'].addEventListener('click', () => switchHistorialSubtab('chart'));
  }
  if (els['chart-toggle-paid']) {
    els['chart-toggle-paid'].addEventListener('click', () => switchChartMode('paid'));
  }
  if (els['chart-toggle-pending']) {
    els['chart-toggle-pending'].addEventListener('click', () => switchChartMode('pending'));
  }

  // Delete modal
  if (els.deleteConfirm) {
    els.deleteConfirm.addEventListener('click', confirmDelete);
  }
  if (els.deleteCancel) {
    els.deleteCancel.addEventListener('click', closeDeleteModal);
  }
  if (els.deleteModalBackdrop) {
    els.deleteModalBackdrop.addEventListener('click', closeDeleteModal);
  }
}

/* ── TABS (SIDEBAR) ── */
function switchTab(tabName) {
  state.currentTab = tabName;
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.add('hidden'));
  document.querySelectorAll('.sidebar-btn').forEach(btn => btn.classList.remove('sidebar-btn--active'));
  const panel = document.getElementById(`panel-${tabName}`);
  if (panel) {
    panel.classList.remove('hidden');
    // Re-trigger animation
    panel.classList.remove('animate-fade-up');
    void panel.offsetWidth;
    panel.classList.add('animate-fade-up');
  }
  const tabBtn = document.getElementById(`tab-${tabName}`);
  if (tabBtn) tabBtn.classList.add('sidebar-btn--active');

  // Specific view logic
  if (tabName === 'planteles') {
    renderPlantelesSelection();
  } else if (tabName === 'jugadores') {
    renderJugadoresView();
  } else if (tabName === 'historial' && state.currentHistorialSubtab === 'chart') {
    renderCategoryChart();
  }
}

/* ── TYPE TOGGLE ── */
function setType(type) {
  const hiddenInput = els.movementForm.elements.type;
  if (hiddenInput) hiddenInput.value = type;
  els.typeToggle.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.toggle('type-btn--active', btn.dataset.type === type);
  });
}

/* ── FILTER ── */
function setFilter(filter) {
  state.currentFilter = filter;
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.classList.toggle('filter-btn--active', btn.dataset.filter === filter);
  });
  renderMovements();
}

/* ── DATA REFRESH ── */
async function refreshAll() {
  setStatus('loading');
  clearFormError();

  try {
    const phaseParam = state.selectedPhaseId || '3';
    const [summary, teams, movements] = await Promise.all([
      fetchJSON(`/api/summary?phaseId=${phaseParam}`),
      fetchJSON('/api/teams'),
      fetchJSON(`/api/movements?phaseId=${phaseParam}`),
    ]);

    state.summary = summary;
    state.teams = Array.isArray(teams) ? teams : [];
    state.movements = Array.isArray(movements) ? movements : [];

    renderSummary();
    renderTournamentKPIs();
    renderTeamOptions();
    renderTeams();
    renderMovements();
    setStatus('ok');
  } catch (error) {
    console.error(error);
    setStatus('error');
    showToast('No se pudo conectar con el backend. Revisá que la API esté activa.', 'error');
  }
}

/* ── FORM SUBMIT ── */
async function handleMovementSubmit(event) {
  event.preventDefault();
  clearFormError();

  const form = event.currentTarget;
  const formData = new FormData(form);

  // Resolve category (custom if "otro" selected)
  let category = String(formData.get('category') || '').trim();
  if (category === '__otro__') {
    category = String(formData.get('categoryCustom') || '').trim();
  }

  // Resolve method (custom if "otro" selected)
  let method = String(formData.get('method') || '').trim();
  if (method === '__otro__') {
    method = String(formData.get('methodCustom') || '').trim();
  }

  const amountCents = moneyToCents(formData.get('amount'));
  const payload = {
    type: String(formData.get('type') || 'income'),
    amountCents,
    date: String(formData.get('date') || ''),
    category,
    method,
    description: String(formData.get('description') || '').trim(),
  };

  const teamId = String(formData.get('teamId') || '').trim();
  if (teamId) payload.teamId = Number(teamId);

  // Validation
  if (!payload.amountCents || payload.amountCents <= 0) {
    showFormError('El monto debe ser mayor a cero.');
    return;
  }
  if (!payload.date) {
    showFormError('Completá la fecha del movimiento.');
    return;
  }
  if (!category) {
    showFormError('Seleccioná o escribí una categoría.');
    return;
  }
  if (!method) {
    showFormError('Seleccioná o escribí un método de pago.');
    return;
  }

  // Submit
  const movementId = formData.get('id');
  const isUpdate = !!movementId;
  const btn = els.submitBtn;
  const btnText = els.submitBtnText || btn;

  btn.disabled = true;
  if (btnText === btn) {
    btn.textContent = isUpdate ? 'Actualizando...' : 'Guardando...';
  } else {
    btnText.textContent = isUpdate ? 'Actualizando...' : 'Guardando...';
  }

  const url = isUpdate ? `/api/movements/${movementId}` : '/api/movements';
  const methodReq = isUpdate ? 'PUT' : 'POST';

  try {
    await fetchJSON(url, {
      method: methodReq,
      body: JSON.stringify(payload),
    });

    if (isUpdate) {
      showToast('Movimiento actualizado correctamente', 'success');
      cancelEditMovement();
    } else {
      showToast(
        `${payload.type === 'income' ? 'Cobro' : 'Pago'} de ${formatMoney(amountCents)} registrado`,
        'success'
      );
      form.reset();
      form.elements.date.value = toISODate(new Date());
      setType('income');
      els.categoryCustomInput?.classList.add('hidden');
      els.methodCustomInput?.classList.add('hidden');
    }

    setStatus('ok');
    await refreshAll();
    if (!isUpdate) switchTab('historial');
  } catch (error) {
    console.error(error);
    showToast('No se pudo guardar el movimiento. Revisá los campos.', 'error');
  } finally {
    btn.disabled = false;
    const finalLabel = isUpdate ? 'Actualizar movimiento' : 'Guardar movimiento';
    if (btnText === btn) {
      btn.textContent = finalLabel;
    } else {
      btnText.textContent = finalLabel;
    }
  }
}


/* ── RENDER SUMMARY ── */
function renderSummary() {
  const s = state.summary || {};
  if (els.balanceValue) els.balanceValue.textContent = formatMoney(s.balanceCents || 0);
  if (els.incomeValue) els.incomeValue.textContent = formatMoney(s.incomeCents || 0);
  if (els.expenseValue) els.expenseValue.textContent = formatMoney(s.expenseCents || 0);
  if (els.movementCountValue) els.movementCountValue.textContent = formatNumber(s.movementCount || 0);

  const balance = Number(s.balanceCents || 0);
  if (els.balanceNote) els.balanceNote.textContent = balance >= 0 ? 'Disponible en caja' : 'Caja en negativo';
  if (els.balanceValue) els.balanceValue.className = `text-2xl font-extrabold leading-tight ${balance < 0 ? 'text-red-400' : 'text-pitch-400'}`;
}

function renderTournamentKPIs() {
  const s = state.summary || {};
  const t = s.tournament || {};

  // Tournament name in header
  if (els.tournamentName) {
    els.tournamentName.textContent = t.name || 'Torneo de Fútbol';
  }

  // KPI strip
  if (els.budgetValue) els.budgetValue.textContent = formatMoney(t.budgetCents || 0);
  if (els.pendingValue) {
    els.pendingValue.textContent = formatMoney(t.pendingCollectionCents || 0);
    // Turn green if fully collected
    els.pendingValue.className = `text-2xl font-extrabold leading-tight ${(t.pendingCollectionCents || 0) <= 0 ? 'text-emerald-400' : 'text-orange-400'
      }`;
  }

  // Progress bar (KPI strip)
  const pct = t.collectionProgressPct ?? 0;
  if (els.collectionProgressBar) els.collectionProgressBar.style.width = `${pct}%`;
  if (els.collectionProgressPct) els.collectionProgressPct.textContent = `${pct}%`;

  // Tournament tab panel KPIs
  if (els['t-budgetValue']) els['t-budgetValue'].textContent = formatMoney(t.budgetCents || 0);
  if (els['t-incomeValue']) els['t-incomeValue'].textContent = formatMoney(s.incomeCents || 0);
  if (els['t-expenseValue']) els['t-expenseValue'].textContent = formatMoney(s.expenseCents || 0);
  if (els['t-pendingValue']) els['t-pendingValue'].textContent = formatMoney(t.pendingCollectionCents || 0);
  if (els['t-progressPct']) els['t-progressPct'].textContent = `${pct}%`;
  if (els['t-progressBar']) els['t-progressBar'].style.width = `${pct}%`;

  // Populate tournament config form (if not focused)
  if (els.tournamentNameInput && document.activeElement !== els.tournamentNameInput) {
    els.tournamentNameInput.value = t.name || '';
  }
  if (els.tournamentBudgetInput && document.activeElement !== els.tournamentBudgetInput) {
    const budgetPesos = (t.budgetCents || 0) / 100;
    els.tournamentBudgetInput.value = budgetPesos > 0 ? budgetPesos.toFixed(2) : '';
  }
  if (els.tournamentStartInput && document.activeElement !== els.tournamentStartInput) {
    els.tournamentStartInput.value = t.startDate || '';
  }
  if (els.tournamentNotesInput && document.activeElement !== els.tournamentNotesInput) {
    els.tournamentNotesInput.value = t.notes || '';
  }
}

/* ── RENDER TEAM OPTIONS ── */
function renderTeamOptions() {
  const select = els.movementForm.elements.teamId;
  const filterSelect = els.teamFilterSelect;
  if (!select) return;

  const current = select.value;
  const currentFilter = filterSelect ? filterSelect.value : 'all';

  const sorted = state.teams.slice().sort((a, b) => Number(a.slotNumber || 0) - Number(b.slotNumber || 0));
  const optionsHtml = sorted.map(t => `<option value="${escapeAttr(t.id)}">${escapeHTML(slotLabel(t))} — ${escapeHTML(t.name || 'Sin nombre')}</option>`).join('');

  select.innerHTML = '<option value="">Sin equipo</option>' + optionsHtml;
  if (current) select.value = current;

  if (filterSelect) {
    filterSelect.innerHTML = '<option value="all">Todos</option>' + 
      '<option value="0">General (Sin equipo)</option>' +
      optionsHtml;
    filterSelect.value = currentFilter;
  }
}

/* ── RENDER TEAMS ── */
function renderTeams() {
  if (!state.teams.length) {
    els.teamsList.innerHTML = '<div class="col-span-full text-center text-gray-600 py-8">Todavía no hay equipos cargados.</div>';
    return;
  }
  els.teamsList.innerHTML = '';
  const sorted = state.teams.slice().sort((a, b) => Number(a.slotNumber || 0) - Number(b.slotNumber || 0));
  sorted.forEach(team => {
    const card = document.createElement('article');
    card.className = 'team-card bg-surface-850 rounded-2xl border border-white/5 p-4';
    card.innerHTML = `
      <div class="flex items-center gap-4 mb-4">
        <div class="w-16 h-16 rounded-xl bg-pitch-900/40 border border-white/5 flex items-center justify-center flex-shrink-0 overflow-hidden">
          ${team.shieldUrl
        ? `<img src="${escapeAttr(team.shieldUrl)}" class="w-full h-full object-contain p-1" alt="Escudo" />`
        : `<span class="text-sm font-extrabold text-pitch-400">${escapeHTML(team.slotNumber ?? team.id)}</span>`
      }
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-white truncate flex items-center gap-1.5">
            ${escapeHTML(team.name || 'Sin nombre')}
            ${team.pointsDeduction
              ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm" title="Equipos con sanción pendiente de cumplimiento, quedando sujetos a la quita de los puntos obtenidos entre la Fecha 1 y la Fecha 9 inclusive, conforme al reglamento vigente.">Sancionado</span>`
              : ''
            }
          </p>
          <p class="text-xs text-gray-500 truncate">${escapeHTML(team.notes || 'Sin notas')}</p>
        </div>
      </div>
      <form class="team-edit flex flex-col gap-3" data-team-id="${escapeAttr(team.id)}">
        <div class="flex flex-col gap-1">
          <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nombre</label>
          <input name="name" type="text" value="${escapeAttr(team.name || '')}" placeholder="Nombre del equipo" class="form-input text-sm" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Notas</label>
          <textarea name="notes" rows="2" placeholder="Observaciones, estado de pagos..." class="form-input text-sm resize-none">${escapeHTML(team.notes || '')}</textarea>
        </div>
        <div class="flex items-center gap-2 my-1">
          <input type="checkbox" id="pointsDeduction-${team.id}" name="pointsDeduction" ${team.pointsDeduction ? 'checked' : ''} class="w-4 h-4 rounded bg-surface-900 border-white/10 text-emerald-500 focus:ring-emerald-500/20 focus:ring-offset-0 focus:ring-1 cursor-pointer" />
          <label for="pointsDeduction-${team.id}" class="text-xs font-semibold text-red-400/90 cursor-pointer select-none">
            Sancionar equipo (F1 a F9 — Solo Apertura)
          </label>
        </div>
        <div class="flex justify-end">
          <button type="submit" class="text-xs font-semibold px-3 py-1.5 rounded-lg bg-surface-800 text-gray-300 hover:bg-surface-700 border border-white/5 transition-colors cursor-pointer">Guardar</button>
        </div>
      </form>
    `;
    card.querySelector('form.team-edit').addEventListener('submit', e => handleTeamSave(e, team.id));
    els.teamsList.appendChild(card);
  });
}

/* ── JUGADORES MANAGEMENT VIEW ── */
function normalizeSearchText(str) {
  return String(str || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

async function renderJugadoresView() {
  const tbody = document.getElementById('playersManagementTbody');
  if (!tbody) return;

  const searchInput = document.getElementById('playerSearchInput');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', (e) => {
      state.playerSearchQuery = e.target.value;
      filterAndRenderPlayers();
    });
  }

  const filterSelect = document.getElementById('playerTeamFilterSelect');
  if (filterSelect && !filterSelect.dataset.bound) {
    filterSelect.dataset.bound = 'true';
    filterSelect.addEventListener('change', (e) => {
      state.playerTeamFilter = e.target.value;
      filterAndRenderPlayers();
    });
  }

  try {
    const [playersRes, teamsRes] = await Promise.all([
      fetch('/api/players'),
      fetch('/api/teams')
    ]);
    state.allPlayersList = await playersRes.json();
    state.allTeamsList = await teamsRes.json();
    state.teams = state.allTeamsList;

    if (filterSelect) {
      filterSelect.innerHTML = '<option value="all">Todos los Clubes</option>';
      state.allTeamsList.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.name;
        filterSelect.appendChild(opt);
      });
      filterSelect.value = state.playerTeamFilter || 'all';
    }

    filterAndRenderPlayers();
  } catch (err) {
    console.error('Error al cargar padrón de jugadores:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-red-400">Error al cargar padrón de jugadores</td></tr>';
  }
}

function filterAndRenderPlayers() {
  const tbody = document.getElementById('playersManagementTbody');
  const badge = document.getElementById('playerCountBadge');
  if (!tbody) return;

  let filtered = state.allPlayersList || [];
  const searchInput = document.getElementById('playerSearchInput');
  const query = searchInput ? normalizeSearchText(searchInput.value) : normalizeSearchText(state.playerSearchQuery);
  const teamFilter = state.playerTeamFilter || 'all';

  if (teamFilter !== 'all') {
    filtered = filtered.filter(p => String(p.teamId) === String(teamFilter));
  }

  if (query) {
    filtered = filtered.filter(p =>
      normalizeSearchText(p.name).includes(query) ||
      normalizeSearchText(p.dni).includes(query) ||
      normalizeSearchText(p.teamName).includes(query)
    );
  }

  if (badge) {
    badge.textContent = `${filtered.length} ${filtered.length === 1 ? 'jugador' : 'jugadores'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-8 text-center text-gray-500 italic">No se encontraron jugadores con los filtros seleccionados</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((p, idx) => {
    const jsonEncoded = encodeURIComponent(JSON.stringify(p));
    return `
      <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
        <td class="py-3 px-4 font-bold text-gray-600 group-hover:text-gray-400 transition-colors text-xs">${idx + 1}</td>
        <td class="py-3 px-4 font-bold text-gray-100 text-sm">
          <div class="flex items-center gap-2">
            <span>${escapeHTML(p.name)}</span>
            ${!p.isActive ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-bold border border-red-500/20">Inactivo</span>' : ''}
          </div>
        </td>
        <td class="py-3 px-4 font-mono text-gray-400 text-xs">${p.dni ? escapeHTML(p.dni) : '<span class="text-gray-700 italic">-</span>'}</td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded bg-surface-900 border border-white/5 p-1 flex-shrink-0 flex items-center justify-center">
              ${p.teamShield ? `<img src="${escapeAttr(p.teamShield)}" class="w-full h-full object-contain" />` : '<span class="text-[9px] text-gray-700">?</span>'}
            </div>
            <select onchange="quickTransferPlayer(${p.id}, this.value)" class="bg-surface-900 border border-white/10 hover:border-pitch-500/40 text-amber-300 font-bold text-xs rounded-lg px-2 py-1 cursor-pointer focus:outline-none transition-colors">
              ${state.allTeamsList.map(t => `<option value="${t.id}" ${t.id === p.teamId ? 'selected' : ''}>${escapeHTML(t.name)}</option>`).join('')}
            </select>
          </div>
        </td>
        <td class="py-3 px-4 text-center font-mono font-bold text-gray-300">${p.number ? `#${p.number}` : '<span class="text-gray-700 italic">-</span>'}</td>
        <td class="py-3 px-4 text-gray-400 font-medium">${p.position ? escapeHTML(p.position) : '<span class="text-gray-700 italic">-</span>'}</td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-2">
            <button type="button" onclick="openEditPlayerModal('${jsonEncoded}', ${p.teamId})" title="Editar Jugador" class="p-1.5 rounded-lg bg-surface-800 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 border border-white/5 transition-colors cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button type="button" onclick="deletePlayerGlobal(${p.id}, '${escapeAttr(p.name)}')" title="Eliminar Jugador" class="p-1.5 rounded-lg bg-surface-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 border border-white/5 transition-colors cursor-pointer">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function quickTransferPlayer(playerId, newTeamId) {
  const p = (state.allPlayersList || []).find(x => x.id === playerId);
  if (!p) return;
  const newTeam = (state.allTeamsList || []).find(t => String(t.id) === String(newTeamId));
  const newTeamName = newTeam ? newTeam.name : 'nuevo equipo';

  try {
    await fetchJSON(`/api/players/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify({
        teamId: Number(newTeamId),
        name: p.name,
        number: p.number,
        dni: p.dni,
        position: p.position || 'Delantero',
        isActive: 1
      })
    });
    showToast(`Jugador "${p.name}" transferido a ${newTeamName}`, 'success');
    renderJugadoresView();
  } catch (err) {
    console.error(err);
    showToast('Error al reasignar equipo al jugador', 'error');
  }
}

async function deletePlayerGlobal(playerId, playerName) {
  if (!confirm(`¿Seguro querés eliminar al jugador "${playerName}"?`)) return;
  try {
    await fetchJSON(`/api/players/${playerId}`, { method: 'DELETE' });
    showToast('Jugador eliminado correctamente', 'success');
    renderJugadoresView();
  } catch (err) {
    showToast('Error al eliminar jugador', 'error');
  }
}

function openCreatePlayerModal() {
  if (!els.editPlayerModal) return;
  els.editPlayerId.value = '';
  
  if (els.editPlayerTeamId) {
    const sortedTeams = (state.allTeamsList || state.teams || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    els.editPlayerTeamId.innerHTML = sortedTeams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
  }
  
  els.editPlayerName.value = '';
  els.editPlayerNumber.value = '';
  els.editPlayerDni.value = '';
  els.editPlayerPosition.value = 'Delantero';

  const modalTitle = els.editPlayerModal.querySelector('p.font-bold');
  if (modalTitle) modalTitle.textContent = 'Registrar Nuevo Jugador';

  els.editPlayerModal.classList.remove('hidden');
}

window.renderJugadoresView = renderJugadoresView;
window.filterAndRenderPlayers = filterAndRenderPlayers;
window.quickTransferPlayer = quickTransferPlayer;
window.deletePlayerGlobal = deletePlayerGlobal;
window.openCreatePlayerModal = openCreatePlayerModal;

/* ── RENDER PLANTELES (LISTAS DE BUENA FE) ── */
let currentPlantelTeamId = null;

function renderPlantelesSelection() {
  if (!els.plantelesTeamSelector) return;
  els.plantelesTeamSelector.innerHTML = '';

  if (!state.teams.length) {
    els.plantelesEmptyState?.classList.remove('hidden');
    els.plantelesActiveState?.classList.add('hidden');
    return;
  }

  const sorted = state.teams.slice().sort((a, b) => Number(a.slotNumber || 0) - Number(b.slotNumber || 0));

  // Render selector badges
  sorted.forEach(team => {
    const btn = document.createElement('button');
    const isActive = team.id === currentPlantelTeamId;
    const shieldImg = team.shieldUrl
      ? `<img src="${escapeAttr(team.shieldUrl)}" class="w-6 h-6 object-contain mr-2" />`
      : '';
    btn.innerHTML = `${shieldImg}<span>${escapeHTML(team.name || `Equipo ${team.slotNumber}`)}</span>`;
    btn.className = `flex items-center px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isActive
      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
      : 'bg-surface-800 text-gray-400 border-white/5 hover:bg-surface-700 hover:text-gray-200'
      }`;
    btn.onclick = () => renderListaBuenaFe(team.id);
    els.plantelesTeamSelector.appendChild(btn);
  });

  // Automatically select the first team if none is selected
  if (!currentPlantelTeamId && sorted.length > 0) {
    renderListaBuenaFe(sorted[0].id);
  }
}

async function renderListaBuenaFe(teamId) {
  currentPlantelTeamId = teamId;
  const team = state.teams.find(t => t.id === teamId);
  if (!team) return;

  // Update UI Views
  els.plantelesEmptyState?.classList.add('hidden');
  els.plantelesActiveState?.classList.remove('hidden');

  // Update Header & Selectors active states
  renderPlantelesSelection();

  if (els.plantelesActiveTeamName) els.plantelesActiveTeamName.textContent = team.name || `Equipo ${team.slotNumber}`;
  if (els.addPlantelTeamId) els.addPlantelTeamId.value = team.id;

  // Fetch Players
  if (els.plantelesTableBody) {
    els.plantelesTableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-gray-500"><div class="animate-pulse">Cargando jugadores...</div></td></tr>';
  }

  try {
    const players = await fetchJSON(`/api/teams/${teamId}/players`);
    els.plantelesPlayerCount.textContent = `${players.length} Jugadores`;

    if (players.length === 0) {
      els.plantelesTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-xs text-gray-500 italic bg-surface-900/10">
            Aún no hay jugadores registrados en la lista de buena fe de este equipo.
          </td>
        </tr>`;
    } else {
      els.plantelesTableBody.innerHTML = players.map(p => `
        <tr class="hover:bg-surface-800/50 transition-colors">
          <td class="py-3 px-4 text-center">
            <span class="inline-flex w-6 h-6 items-center justify-center rounded-md bg-surface-900 text-gray-300 font-bold text-[10px] border border-white/5">
              ${escapeHTML(p.number || '-')}
            </span>
          </td>
          <td class="py-3 px-4 font-medium text-white text-sm">${escapeHTML(p.name)}</td>
          <td class="py-3 px-4 text-gray-400 text-xs font-mono tracking-wider">${escapeHTML(p.dni || 'Sin DNI')}</td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-surface-900 border border-white/5 text-gray-300">
              ${escapeHTML(p.position)}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <div class="flex items-center justify-center gap-1">
              <button onclick="openEditPlayerModal('${encodeURIComponent(JSON.stringify(p))}', ${teamId})" title="Editar" class="text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10 p-1.5 rounded transition-colors inline-block">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </button>
              <button onclick="handleDeletePlantelPlayer(${p.id}, ${teamId})" title="Dar de baja" class="text-gray-500 hover:text-red-400 hover:bg-red-500/10 p-1.5 rounded transition-colors inline-block">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (error) {
    if (els.plantelesTableBody) {
      els.plantelesTableBody.innerHTML = '<tr><td colspan="5" class="py-4 text-center text-xs text-red-400">Error al cargar jugadores</td></tr>';
    }
  }
}

async function handleAddPlantelPlayer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const teamId = Number(formData.get('teamId'));

  const payload = {
    name: String(formData.get('name') || '').trim(),
    number: formData.get('number') ? Number(formData.get('number')) : null,
    dni: formData.get('dni') ? String(formData.get('dni')).trim() : null,
    position: String(formData.get('position') || 'Delantero').trim()
  };

  if (!payload.name) {
    showToast('El nombre del jugador es requerido.', 'error');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const orgText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';

  try {
    await fetchJSON(`/api/teams/${teamId}/players`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    showToast('Jugador agregado a la Lista de Buena Fe.', 'success');
  } catch (e) {
    showToast('Error al agregar jugador.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orgText;
    renderListaBuenaFe(teamId);
  }
}

async function handleDeletePlantelPlayer(playerId, teamId) {
  if (!confirm('¿Seguro querés eliminar a este jugador de la lista de buena fe? Las tarjetas que tenga registradas también se podrían perder.')) return;

  try {
    await fetchJSON(`/api/players/${playerId}`, { method: 'DELETE' });
    showToast('Jugador dado de baja correctamente', 'success');
    renderListaBuenaFe(teamId);
  } catch (e) {
    showToast('Error al eliminar jugador', 'error');
  }
}

function openEditPlayerModal(playerJsonEncoded, teamId) {
  try {
    const p = JSON.parse(decodeURIComponent(playerJsonEncoded));
    els.editPlayerId.value = p.id;
    
    if (els.editPlayerTeamId) {
      const sortedTeams = state.teams.slice().sort((a, b) => Number(a.slotNumber || 0) - Number(b.slotNumber || 0));
      els.editPlayerTeamId.innerHTML = sortedTeams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
      els.editPlayerTeamId.value = teamId;
    }
    
    els.editPlayerName.value = p.name || '';
    els.editPlayerNumber.value = p.number || '';
    els.editPlayerDni.value = p.dni || '';
    els.editPlayerPosition.value = p.position || 'Delantero';

    els.editPlayerModal.classList.remove('hidden');
  } catch (err) {
    console.error('Error opening edit modal:', err);
    showToast('Error al abrir editor de jugador', 'error');
  }
}

async function handleEditPlayerSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const playerId = Number(formData.get('playerId'));
  const teamId = Number(formData.get('teamId'));

  const payload = {
    name: String(formData.get('name') || '').trim(),
    number: formData.get('number') ? Number(formData.get('number')) : null,
    dni: formData.get('dni') ? String(formData.get('dni')).trim() : null,
    position: String(formData.get('position') || 'Delantero').trim(),
    isActive: 1, // We keep it active for now as per the current flow
    teamId: teamId
  };

  if (!payload.name) {
    showToast('El nombre del jugador es requerido.', 'error');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  const orgText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    await fetchJSON(`/api/players/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    els.editPlayerModal.classList.add('hidden');
    showToast('Jugador actualizado correctamente.', 'success');
    renderListaBuenaFe(teamId);
  } catch (e) {
    showToast('Error al actualizar jugador.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = orgText;
  }
}


/* ── RENDER MOVEMENTS ── */
function renderMovements() {
  const table = els.movementsTbody.closest('table');
  const thead = table.querySelector('thead tr');

  if (state.currentFilter === 'teams-insc') {
    // Render Accumulated View
    const teamInsc = state.movements
      .filter(m => m.type === 'income' && m.category === 'Inscripción')
      .reduce((acc, m) => {
        const teamId = m.teamId || 0;
        const teamName = m.teamName || m.team?.name || 'General';
        if (!acc[teamId]) acc[teamId] = { name: teamName, total: 0, count: 0 };
        acc[teamId].total += (m.amountCents || m.amount || 0);
        acc[teamId].count += 1;
        return acc;
      }, {});

    // Add teams with zero payments
    state.teams.forEach(team => {
      if (!teamInsc[team.id]) {
        teamInsc[team.id] = { name: team.name, total: 0, count: 0 };
      }
    });

    const sortedTeams = Object.values(teamInsc).sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.name.localeCompare(b.name);
    });

    if (els.movCountBadge) {
      const paidCount = Object.values(teamInsc).filter(t => t.count > 0).length;
      els.movCountBadge.textContent = `${paidCount} de ${state.teams.length} equipos con pagos`;
    }

    // Calculate target amount per team based on budget
    const budgetCents = state.summary?.tournament?.budgetCents || 0;
    const teamCount = state.teams.length || 10;
    const targetAmountCents = Math.round(budgetCents / teamCount);

    // Update Headers
    thead.innerHTML = `
      <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Equipo</th>
      <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Inscripción Total</th>
      <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto Pagado</th>
      <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Falta Pagar</th>
      <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">% Pagado</th>
      <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Pagos</th>
    `;

    if (!sortedTeams.length) {
      els.movementsTbody.innerHTML = `<tr><td colspan="6" class="px-4 py-10 text-center text-gray-600 text-sm">No hay pagos de inscripción registrados aún.</td></tr>`;
      return;
    }

    els.movementsTbody.innerHTML = sortedTeams.map(team => {
      const pendingCents = Math.max(0, targetAmountCents - team.total);
      const isComplete = pendingCents <= 0;
      // Prevent rounding up to 100% when there is still a pending debt
      const pct = targetAmountCents > 0
        ? (isComplete ? 100 : Math.min(99, Math.floor((team.total / targetAmountCents) * 100)))
        : 0;

      return `
        <tr class="hover:bg-surface-800/40 transition-colors">
          <td class="px-4 py-3 text-sm font-bold text-white">${escapeHTML(team.name)}</td>
          <td class="px-4 py-3 text-right font-medium text-gray-400 text-sm">${escapeHTML(formatMoney(targetAmountCents))}</td>
          <td class="px-4 py-3 text-right font-bold ${isComplete ? 'text-emerald-400' : 'text-amber-400'} text-sm">${escapeHTML(formatMoney(team.total))}</td>
          <td class="px-4 py-3 text-right font-bold ${pendingCents > 0 ? 'text-red-400' : 'text-gray-500'} text-sm">${escapeHTML(formatMoney(pendingCents))}</td>
          <td class="px-4 py-3 text-center">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black ${isComplete ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}">
              ${pct}%
            </span>
          </td>
          <td class="px-4 py-3 text-center text-sm text-gray-500">
            <span class="px-2 py-0.5 rounded-lg bg-surface-900 border border-white/5">${team.count}</span>
          </td>
        </tr>
      `;
    }).join('');

    return;
  }

  // Restore Original Headers for standard filters
  thead.innerHTML = `
    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider col-tipo">Tipo</th>
    <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Monto</th>
    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Categoría</th>
    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hide-mobile">Método</th>
    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Equipo</th>
    <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider col-desc">Descripción</th>
    <th class="px-4 py-3 w-10"></th>
  `;

  const filtered = state.movements.filter(m => {
    const matchesType = state.currentFilter === 'all' || m.type === state.currentFilter;
    let matchesTeam = true;
    if (state.currentTeamFilter !== 'all') {
      const teamId = Number(state.currentTeamFilter);
      matchesTeam = Number(m.teamId || 0) === teamId;
    }
    return matchesType && matchesTeam;
  });

  if (els.movCountBadge) {
    els.movCountBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'movimiento' : 'movimientos'}`;
  }

  if (!filtered.length) {
    els.movementsTbody.innerHTML = `<tr><td colspan="8" class="px-4 py-10 text-center text-gray-600 text-sm">${state.movements.length ? 'Ningún movimiento con ese filtro.' : 'Todavía no hay movimientos registrados. ¡Registrá el primero!'
      }</td></tr>`;
    return;
  }

  els.movementsTbody.innerHTML = '';
  filtered.slice(0, 50).forEach(movement => {
    const tr = document.createElement('tr');
    tr.className = state.movementsEditEnabled
      ? 'movement-row cursor-pointer hover:bg-surface-800/40 transition-colors group'
      : 'movement-row cursor-default transition-colors group';
    const isIncome = movement.type !== 'expense';

    // Check if being edited
    const isEditing = els.movementForm.elements.id.value === String(movement.id);
    if (isEditing) tr.classList.add('bg-blue-500/10', 'border-l-2', 'border-blue-500');

    tr.innerHTML = `
      <td class="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">${escapeHTML(formatDate(movement.date))}</td>
      <td class="px-4 py-3 col-tipo">
        <span class="${isIncome ? 'badge-income' : 'badge-expense'}">
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            ${isIncome
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18"/>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3"/>'}
          </svg>
          ${isIncome ? 'Cobro' : 'Pago'}
        </span>
      </td>
      <td class="px-4 py-3 text-right font-bold text-sm whitespace-nowrap ${isIncome ? 'text-emerald-400' : 'text-red-400'}">
        ${isIncome ? '+' : '−'} ${escapeHTML(formatMoney(movement.amountCents || movement.amount || 0))}
      </td>
      <td class="px-4 py-3 text-sm text-gray-300 font-medium">${escapeHTML(movement.category || '—')}</td>
      <td class="px-4 py-3 text-sm text-gray-400 hide-mobile">${escapeHTML(movement.method || '—')}</td>
      <td class="px-4 py-3 text-sm text-gray-400">${escapeHTML(movement.teamName || movement.team?.name || 'General')}</td>
      <td class="px-4 py-3 text-sm text-gray-500 col-desc">${escapeHTML(movement.description || '—')}</td>
      <td class="px-4 py-3 text-right">
        ${state.movementsEditEnabled ? `
        <button type="button" aria-label="Eliminar movimiento" data-delete-id="${escapeHTML(movement.id)}"
          class="w-7 h-7 rounded-lg inline-flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-950/40 transition-colors opacity-0 group-hover:opacity-100">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
        ` : ''}
      </td>
    `;

    // Row Click -> Edit
    tr.addEventListener('click', (e) => {
      if (!state.movementsEditEnabled) return;
      if (e.target.closest('button')) return; // Ignore if clicking delete button
      handleEditMovement(movement);
    });

    if (state.movementsEditEnabled) {
      tr.querySelector('[data-delete-id]').addEventListener('click', (e) => {
        e.stopPropagation();
        openDeleteModal('movement', movement.id);
      });
    }

    els.movementsTbody.appendChild(tr);
  });

  // Always update the category chart to keep it in sync with current data/filters
  renderCategoryChart();
}

/* ── TEAM SAVE ── */
async function handleTeamSave(event, teamId) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const currentTeam = state.teams.find(t => t.id === teamId);
  const shieldUrl = currentTeam ? currentTeam.shieldUrl : null;
  const payload = {
    name: String(formData.get('name') || '').trim(),
    notes: String(formData.get('notes') || '').trim(),
    pointsDeduction: formData.get('pointsDeduction') ? 1 : 0,
    shieldUrl: shieldUrl
  };
  try {
    await fetchJSON(`/api/teams/${encodeURIComponent(teamId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    showToast('Equipo actualizado correctamente', 'success');
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast('No se pudo guardar el equipo. Revisá el backend.', 'error');
  }
}

/* ── TOURNAMENT SAVE ── */
async function handleTournamentSave(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const budgetRaw = Number(String(formData.get('budgetAmount') || '0').replace(',', '.'));
  const budgetCents = Math.round(budgetRaw * 100);
  const payload = {
    name: String(formData.get('name') || '').trim(),
    budgetCents,
    startDate: String(formData.get('startDate') || '').trim() || null,
    notes: String(formData.get('notes') || '').trim(),
  };

  if (els.tournamentFormError) els.tournamentFormError.classList.add('hidden');

  try {
    await fetchJSON('/api/tournament', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    showToast(`Torneo "${payload.name}" actualizado`, 'success');
    await refreshAll();
  } catch (error) {
    console.error(error);
    showToast('No se pudo guardar la configuración del torneo.', 'error');
  }
}

/* ── DELETE MODAL ── */
function openDeleteModal(type, id, extra = null) {
  state.pendingDeleteId = id;
  state.pendingDeleteType = type;
  state.pendingDeleteExtra = extra;

  if (els.deleteModalTitle) {
    if (type === 'match') {
      els.deleteModalTitle.textContent = 'Eliminar partido';
      els.deleteModalDesc.textContent = '¿Estás seguro de eliminar este partido de la fecha?';
    } else if (type === 'player') {
      els.deleteModalTitle.textContent = 'Eliminar jugador';
      els.deleteModalDesc.textContent = 'El jugador será quitado de la lista de buena fe.';
    } else {
      els.deleteModalTitle.textContent = 'Eliminar movimiento';
      els.deleteModalDesc.textContent = 'Esta acción no se puede deshacer.';
    }
  }

  els.deleteModal.classList.remove('hidden');
}

function closeDeleteModal() {
  state.pendingDeleteId = null;
  state.pendingDeleteType = null;
  state.pendingDeleteExtra = null;
  els.deleteModal.classList.add('hidden');
}

async function confirmDelete() {
  const id = state.pendingDeleteId;
  const type = state.pendingDeleteType;
  const extra = state.pendingDeleteExtra;
  if (!id) return;

  closeDeleteModal();

  try {
    if (type === 'match') {
      await fetchJSON(`/api/fixture/matches/${id}`, { method: 'DELETE' });
      showToast('Partido eliminado', 'success');
      renderFixtureContent();
    } else if (type === 'player') {
      await fetchJSON(`/api/players/${id}`, { method: 'DELETE' });
      showToast('Jugador eliminado', 'success');
      if (extra) await loadPlantel(extra);
    } else {
      await fetchJSON(`/api/movements/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast('Movimiento eliminado', 'info');
      await refreshAll();
    }
  } catch (error) {
    console.error(error);
    showToast('Error al intentar eliminar el elemento.', 'error');
  }
}

/* ── TOAST ── */
function showToast(message, type = 'info', duration = 3500) {
  const icons = {
    success: '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>',
    error: '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    info: '<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `${icons[type] || ''}<span>${escapeHTML(message)}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('is-hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, duration);
}

/* ── STATUS PILL ── */
function setStatus(state) {
  const pill = els.appStatus;
  if (!pill) return;
  const dot = pill.querySelector('.status-dot') || pill.querySelector('span:first-child');
  const textEl = pill.querySelector('.status-text');
  pill.className = 'status-pill text-xs font-semibold px-3 py-1.5 rounded-full bg-surface-800 border border-white/5 flex items-center gap-1.5';
  if (dot) dot.className = `status-dot w-1.5 h-1.5 rounded-full inline-block`;
  if (state === 'ok') {
    pill.classList.add('is-ok');
    if (textEl) { textEl.textContent = 'Sincronizado'; textEl.style.color = ''; }
  } else if (state === 'error') {
    pill.classList.add('is-error');
    if (textEl) { textEl.textContent = 'Error API'; textEl.style.color = ''; }
  } else {
    pill.classList.add('is-loading');
    if (textEl) { textEl.textContent = 'Cargando...'; textEl.style.color = ''; }
  }
}

/* ── FORM ERROR ── */
function showFormError(message) {
  if (!els.formError) return;
  els.formError.textContent = message;
  els.formError.classList.remove('hidden');
  els.formError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearFormError() {
  if (!els.formError) return;
  els.formError.textContent = '';
  els.formError.classList.add('hidden');
}

/* ── FETCH ── */
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const detail = await readResponseDetail(res);
    throw new Error(detail || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function readResponseDetail(res) {
  try {
    const text = await res.text();
    if (!text) return '';
    const parsed = JSON.parse(text);
    return parsed.error || parsed.message || text;
  } catch { return ''; }
}

/* ── UTILS ── */
function formatMoney(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 2,
  }).format(Number(value || 0) / 100);
}

function moneyToCents(value) {
  const amount = Number(String(value || '').replace(',', '.'));
  return Number.isNaN(amount) ? 0 : Math.round(amount * 100);
}

function formatNumber(value) {
  return new Intl.NumberFormat('es-AR').format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

function toISODate(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function slotLabel(team) {
  return `Equipo ${team.slotNumber ?? team.id}`;
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll('`', '&#96;');
}

/* ═══════════════════════════════════════════════════════
   FIXTURE MODULE
════════════════════════════════════════════════════════ */

const fixture = {
  phases: [],       // [{id, year, name, label, tournaments:[...]}]
  currentPhaseId: null,
  currentSub: 't1', // 't1' | 't2'
  t1Id: null,
  t2Id: null,
  editMode: false,
};

function bindFixtureEvents() {
  document.querySelectorAll('[data-fixture-sub]').forEach(btn => {
    btn.addEventListener('click', () => switchFixtureSub(btn.dataset.fixtureSub));
  });

  const toggle = document.getElementById('fixtureEditToggle');
  if (toggle) {
    toggle.addEventListener('change', (e) => {
      fixture.editMode = e.target.checked;
      renderFixtureContent();
    });
  }
}

function switchFixtureSub(sub) {
  fixture.currentSub = sub;
  document.querySelectorAll('.fixture-sub-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.fixtureSub === sub);
  });
  renderFixtureContent();
}

async function loadFixture() {
  const content = document.getElementById('fixtureContent');
  if (!content) return;
  try {
    const phases = await fetchJSON('/api/fixture');
    fixture.phases = phases;
    if (!fixture.currentPhaseId && phases.length) {
      fixture.currentPhaseId = phases[0].id;
    }
    renderPhaseBadges();
    setFixtureTournamentIds();
    renderFixtureContent();
  } catch (e) {
    console.error(e);
    if (content) content.innerHTML = '<p class="text-center text-red-400 py-8">Error cargando el fixture.</p>';
  }
}

function renderPhaseBadges() {
  const container = document.getElementById('fixturePhaseBadges');
  if (!container) return;
  container.innerHTML = fixture.phases.map(p => `
    <button class="phase-badge ${p.id === fixture.currentPhaseId ? 'active' : ''}"
            onclick="selectPhase(${p.id})">${escapeHTML(p.label)}</button>
  `).join('');
}

window.selectPhase = function (phaseId) {
  fixture.currentPhaseId = phaseId;
  setFixtureTournamentIds();
  renderPhaseBadges();
  renderFixtureContent();
};

function setFixtureTournamentIds() {
  const phase = fixture.phases.find(p => p.id === fixture.currentPhaseId);
  if (!phase) return;
  const t1 = phase.tournaments.find(t => t.type === 'todos_contra_todos' && !t.label.toLowerCase().includes('final'));
  const t2 = phase.tournaments.find(t => t.type === 'zonas');
  const final = phase.tournaments.find(t => t.label.toLowerCase().includes('final'));
  fixture.t1Id = t1 ? t1.id : null;
  fixture.t2Id = t2 ? t2.id : null;
  fixture.finalId = final ? final.id : null;

  // Show sub-navigation bar
  if (els.fixtureSubNav) {
    els.fixtureSubNav.classList.remove('hidden');
  }

  // Update active sub-button class
  document.querySelectorAll('.fixture-sub-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.fixtureSub === fixture.currentSub);
  });
}

function renderDualStandingsHtml(standingsA, standingsB) {
  const renderTable = (data, title, badgeColor) => {
    const rows = data.map((s, idx) => `
      <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
        <td class="py-2 px-3 font-bold text-gray-600 group-hover:text-gray-400 text-xs">${idx + 1}</td>
        <td class="py-2 px-3">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 rounded bg-surface-900 border border-white/5 flex items-center justify-center p-1 shadow-inner">
               ${s.shieldUrl ? `<img src="${escapeAttr(s.shieldUrl)}" class="w-full h-full object-contain" />` : '<span class="text-[9px] text-gray-700">?</span>'}
            </div>
            <span class="font-bold text-gray-200 text-xs truncate max-w-[120px]" title="${escapeAttr(s.name)}">${escapeHTML(s.name)}</span>
          </div>
        </td>
        <td class="py-2 px-3 text-gray-400">${s.played}</td>
        <td class="py-2 px-3 text-emerald-400 font-bold">${s.won}</td>
        <td class="py-2 px-3 text-amber-500 font-bold">${s.draw}</td>
        <td class="py-2 px-3 text-red-500 font-bold">${s.lost}</td>
        <td class="py-2 px-3 font-mono font-bold ${s.goalDiff >= 0 ? 'text-emerald-400' : 'text-red-500'}">${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</td>
        <td class="py-2 px-3 font-black text-white bg-white/5">${s.points}</td>
      </tr>
    `).join('') || '<tr><td colspan="8" class="p-4 text-center text-gray-600 italic">No hay posiciones cargadas.</td></tr>';

    return `
      <div class="bg-surface-850 rounded-2xl border border-white/5 overflow-hidden shadow-xl flex-1">
        <div class="p-3 border-b border-white/5 bg-surface-900/50 flex items-center gap-2">
          <span class="flex items-center justify-center w-5 h-5 rounded-full ${badgeColor} font-black text-[10px]">${title.slice(-1)}</span>
          <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-widest">${title}</h3>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left standings-table">
            <thead>
              <tr>
                <th class="py-2 px-3">#</th>
                <th class="py-2 px-3">Equipo</th>
                <th class="py-2 px-3">PJ</th>
                <th class="py-2 px-3">PG</th>
                <th class="py-2 px-3">PE</th>
                <th class="py-2 px-3">PP</th>
                <th class="py-2 px-3">DF</th>
                <th class="py-2 px-3">PTS</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  return `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6 no-print">
      ${renderTable(standingsA, 'Zona A', 'bg-emerald-500/20 text-emerald-400')}
      ${renderTable(standingsB, 'Zona B', 'bg-sky-500/20 text-sky-400')}
    </div>
  `;
}

function renderFinalsViewHtml(finalRounds, t2Rounds, allTeams, finalId) {
  let html = '';

  const phase = fixture.phases.find(p => p.id === fixture.currentPhaseId);
  const phaseLabel = phase ? phase.label : 'Fase';

  // 1. Gran Final de la Fase
  html += `
    <div class="bg-surface-850 rounded-2xl border border-white/5 overflow-hidden mb-6 p-6">
      <div class="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
        <span class="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-lg">🏆</span>
        <div>
          <h3 class="text-sm font-bold text-white uppercase tracking-wider">Gran Final — ${escapeHTML(phaseLabel)}</h3>
          <p class="text-xs text-gray-400">Encuentro decisivo entre el Ganador del Torneo Largo y el Ganador del Torneo Corto</p>
        </div>
      </div>
  `;

  const finalMatchList = (finalRounds && finalRounds.length > 0 && finalRounds[0].matches) ? finalRounds[0].matches : [];
  if (finalMatchList.length > 0) {
    html += `<div class="divide-y divide-white/5">${finalMatchList.map(m => renderMatchCard(m)).join('')}</div>`;
    const playedFinal = finalMatchList.find(m => m.status === 'played');
    if (playedFinal) {
      const winnerName = playedFinal.homeGoals > playedFinal.awayGoals ? playedFinal.homeTeamName : (playedFinal.awayGoals > playedFinal.homeGoals ? playedFinal.awayTeamName : null);
      if (winnerName) {
        html += `
          <div class="mt-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center animate-fade-up">
            <span class="text-xs font-bold text-amber-400 uppercase tracking-widest block">🎉 CAMPEÓN ${escapeHTML(phaseLabel.toUpperCase())} 🎉</span>
            <span class="text-xl font-extrabold text-white mt-1 block">${escapeHTML(winnerName.toUpperCase())}</span>
          </div>
        `;
      }
    }
  } else {
    html += `<p class="text-gray-500 text-xs italic py-4 text-center">Final programada al finalizar ambas competencias de la fase.</p>`;
    if (finalId && fixture.editMode) {
      html += `
        <div class="p-4 bg-surface-900/30 border-t border-white/5 flex justify-center">
          <button onclick="event.preventDefault(); event.stopPropagation(); addManualMatch(${finalId}, 1)" class="text-xs font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Cargar Partido de Gran Final
          </button>
        </div>
      `;
    }
  }
  html += `</div>`;

  // 2. Final del Torneo Corto (Zonas A y B)
  html += `
    <div class="bg-surface-850 rounded-2xl border border-white/5 overflow-hidden mb-6 p-6">
      <div class="flex items-center gap-3 mb-4 pb-3 border-b border-white/5">
        <span class="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 text-lg">🥇</span>
        <div>
          <h3 class="text-sm font-bold text-white uppercase tracking-wider">Final Torneo Corto (Zonas A y B)</h3>
          <p class="text-xs text-gray-400">Definición entre el 1° de la Zona A y el 1° de la Zona B</p>
        </div>
      </div>
  `;

  const round6 = t2Rounds ? t2Rounds.find(r => r.round === 6) : null;
  if (round6 && round6.matches && round6.matches.length > 0) {
    html += `<div class="divide-y divide-white/5">${round6.matches.map(m => renderMatchCard(m)).join('')}</div>`;
  } else {
    html += `<p class="text-gray-500 text-xs italic py-4 text-center">La final del torneo corto se disputará al finalizar la fase de grupos (Fecha 6).</p>`;
  }
  html += `</div>`;

  return html;
}

async function renderFixtureContent() {
  const container = document.getElementById('fixtureContent');
  if (!container) return;

  const phaseId = fixture.currentPhaseId || (fixture.phases[0] ? fixture.phases[0].id : null);
  if (!phaseId) {
    container.innerHTML = '<p class="text-center py-10 text-gray-500">No hay fases disponibles aún.</p>';
    return;
  }

  const sub = fixture.currentSub;

  if (sub === 'final') {
    const finalId = fixture.finalId;
    const t2Id = fixture.t2Id;
    const [finalRounds, t2Rounds, allTeams] = await Promise.all([
      finalId ? fetchJSON(`/api/fixture/tournaments/${finalId}/matches`) : Promise.resolve([]),
      t2Id ? fetchJSON(`/api/fixture/tournaments/${t2Id}/matches`) : Promise.resolve([]),
      fetchJSON('/api/teams')
    ]);
    fixture.teams = allTeams;
    container.innerHTML = renderFinalsViewHtml(finalRounds, t2Rounds, allTeams, finalId);
    return;
  }

  let tournamentId = sub === 't1' ? fixture.t1Id : fixture.t2Id;

  if (!tournamentId) {
    container.innerHTML = `<p class="text-gray-500 text-center py-6">${sub === 't1' ? 'Torneo Largo' : 'Torneo Corto'} no disponible.</p>`;
    return;
  }

  container.innerHTML = '<div class="text-center text-gray-600 py-8 animate-pulse">Cargando fixture...</div>';

  try {
    if (sub === 't1') {
      const [standings, rounds, allTeams] = await Promise.all([
        fetchJSON(`/api/fixture/tournaments/${tournamentId}/standings`),
        fetchJSON(`/api/fixture/tournaments/${tournamentId}/matches`),
        fetchJSON('/api/teams')
      ]);
      fixture.teams = allTeams;
      container.innerHTML = renderStandingsHtml(standings, true) + renderGenerateT2Btn(standings) + renderRoundsHtml(rounds, allTeams, tournamentId);
    } else {
      const [standingsA, standingsB, rounds, allTeams] = await Promise.all([
        fetchJSON(`/api/fixture/tournaments/${tournamentId}/standings?group=A`),
        fetchJSON(`/api/fixture/tournaments/${tournamentId}/standings?group=B`),
        fetchJSON(`/api/fixture/tournaments/${tournamentId}/matches`),
        fetchJSON('/api/teams')
      ]);
      fixture.teams = allTeams;
      container.innerHTML = renderDualStandingsHtml(standingsA, standingsB) + renderRoundsHtml(rounds, allTeams, tournamentId);
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p class="text-center py-10 text-red-500">Error: ${err.message}</p>`;
  }
}

function renderStandingsHtml(standings, showZoneBadge) {
  if (!standings.length) return '<p class="text-gray-600 text-center py-4">Sin datos de posiciones.</p>';

  const rows = standings.map((s, idx) => {
    const isEven = s.position % 2 === 0;
    const rowClass = showZoneBadge ? (isEven ? 'zone-a' : 'zone-b') : '';
    const badge = showZoneBadge
      ? `<span class="pos-badge ${isEven ? 'even' : 'odd'}">${s.position}</span>`
      : `<span class="text-gray-500 text-xs font-bold">${s.position}</span>`;
    const zoneTip = showZoneBadge
      ? `<span class="ml-1 text-xs font-bold ${isEven ? 'text-amber-500' : 'text-blue-400'}">${isEven ? 'A' : 'B'}</span>`
      : '';
    const difColor = s.dif > 0 ? 'text-emerald-400' : s.dif < 0 ? 'text-red-400' : 'text-gray-500';
    return `<tr class="${rowClass}">
      <td>${badge}${zoneTip}</td>
      <td class="flex items-center gap-3">
        <img src="${s.shieldUrl || './escudo-default.png'}" class="w-8 h-8 object-contain" />
        <span class="flex items-center gap-1.5">
          ${escapeHTML(s.name)}
          ${idx === 0 
            ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm" title="Campeón">C</span>` 
            : ''
          }
          ${s.pointsDeduction
            ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm" title="Equipos con sanción pendiente de cumplimiento, quedando sujetos a la quita de los puntos obtenidos entre la Fecha 1 y la Fecha 9 inclusive, conforme al reglamento vigente.">Sancionado</span>`
            : ''
          }
        </span>
      </td>
      <td>${s.pj}</td><td>${s.pg}</td><td>${s.pe}</td><td>${s.pp}</td>
      <td>${s.gf}</td><td>${s.gc}</td>
      <td class="${difColor}">${s.dif > 0 ? '+' : ''}${s.dif}</td>
      <td>${s.pts}</td>
    </tr>`;
  }).join('');

  return `
    <section class="bg-surface-850 rounded-2xl border border-white/5 overflow-hidden mb-4 no-print">
      <div class="px-4 pt-4 pb-2 flex items-center justify-between">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Tabla de posiciones</p>
        ${showZoneBadge ? '<div class="flex gap-2 text-xs"><span class="pos-badge even">P</span><span class="text-gray-500">Par → Zona A</span><span class="pos-badge odd ml-2">P</span><span class="text-gray-500">Impar → Zona B</span></div>' : ''}
      </div>
      <div class="overflow-x-auto">
        <table class="standings-table">
          <thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>GF</th><th>GC</th><th>DIF</th><th>PTS</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function renderGenerateT2Btn(standings) {
  const played = standings.some(s => s.pj > 0);
  return `<div class="mb-4 no-print">
    <button onclick="handleGenerateT2()" class="btn-primary flex items-center gap-2 text-sm">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582M20 20v-5h-.581M5.29 9A8 8 0 0119.41 15M18.71 15A8 8 0 015.58 9"/>
      </svg>
      ${played ? 'Actualizar zonas del Torneo 2' : 'Asignar zonas del Torneo 2'}
    </button>
    <p class="text-xs text-gray-600 mt-1">Posiciones pares → Zona A · Posiciones impares → Zona B</p>
  </div>`;
}



function renderRoundsHtml(rounds, allTeams, tournamentId) {
  if (!rounds.length && !fixture.editMode) return '<p class="text-gray-600 text-center py-4">No hay partidos cargados.</p>';

  const maxRound = rounds.length ? Math.max(...rounds.map(r => r.round)) : 0;

  let html = rounds.map(r => {
    // Calculate Libres
    const teamsInRound = new Set();
    r.matches.forEach(m => {
      teamsInRound.add(m.homeTeamId);
      if (m.awayTeamId) teamsInRound.add(m.awayTeamId);
    });
    const libres = allTeams.filter(t => !teamsInRound.has(t.id));

    return `
    <section class="bg-surface-850 rounded-2xl border border-white/5 overflow-hidden mb-6">
      <div class="px-4 py-3 border-b border-white/5 flex flex-wrap items-center justify-between gap-3 bg-surface-900/40">
        <div class="flex items-center gap-4">
          <p class="text-xs font-bold text-gray-400 uppercase tracking-widest">Fecha ${r.round}</p>
          ${libres.length > 0 ? `
            <div class="flex items-center gap-2 px-2.5 py-1 bg-amber-500/5 border border-amber-500/10 rounded-lg">
              <span class="text-[9px] font-black text-amber-500/80 uppercase tracking-tighter">Libres:</span>
              <span class="text-[10px] text-amber-200/60 font-medium">${libres.map(l => escapeHTML(l.name)).join(', ')}</span>
            </div>
          ` : ''}
        </div>
        <span class="text-[10px] text-gray-500 font-bold uppercase tracking-widest bg-surface-800/50 px-2 py-0.5 rounded-full">${r.matches.filter(m => m.status === 'played').length}/${r.matches.length} jugados</span>
      </div>
      <div class="divide-y divide-white/5">
        ${r.matches.map(m => renderMatchCard(m)).join('')}
      </div>
      ${fixture.editMode ? `
        <div class="p-4 bg-surface-900/30 border-t border-white/5 flex justify-center">
          <button onclick="event.preventDefault(); event.stopPropagation(); addManualMatch(${tournamentId}, ${r.round})" class="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-widest flex items-center gap-2 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            Agregar Partido a Fecha ${r.round}
          </button>
        </div>
      ` : ''}
    </section>`;
  }).join('');

  if (fixture.editMode) {
    html += `
      <div class="flex justify-center py-6">
        <button onclick="event.preventDefault(); event.stopPropagation(); addManualMatch(${tournamentId}, ${maxRound + 1})" class="btn-primary-outline flex items-center gap-2 text-xs py-2 px-6">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          Crear Nueva Fecha (${maxRound + 1})
        </button>
      </div>
    `;
  }

  return html;
}

function renderMatchCard(m) {
  if (fixture.editMode) {
    const teamsOptions = fixture.teams.map(t =>
      `<option value="${t.id}" ${t.id === m.homeTeamId ? 'selected' : ''}>${escapeHTML(t.name)}</option>`
    ).join('');
    const awayOptions = `<option value="">-- LIBRE / BYE --</option>` + fixture.teams.map(t =>
      `<option value="${t.id}" ${t.id === m.awayTeamId ? 'selected' : ''}>${escapeHTML(t.name)}</option>`
    ).join('');

    return `
    <div class="p-4 bg-surface-900/20" id="match-edit-${m.id}">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        <!-- Home Team -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold text-gray-500 uppercase">Local</label>
          <select id="edit-home-${m.id}" class="form-input text-xs py-1.5">${teamsOptions}</select>
        </div>

        <!-- Date / Time -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold text-gray-500 uppercase">Fecha y Hora</label>
          <div class="flex gap-2">
            <input type="date" id="edit-date-${m.id}" value="${m.matchDate || ''}" class="form-input text-xs py-1.5 flex-1" />
            <input type="time" id="edit-time-${m.id}" value="${m.matchTime || ''}" class="form-input text-xs py-1.5 w-24" />
          </div>
        </div>

        <!-- Away Team -->
        <div class="flex flex-col gap-1">
          <label class="text-[9px] font-bold text-gray-500 uppercase">Visitante</label>
          <select id="edit-away-${m.id}" class="form-input text-xs py-1.5">${awayOptions}</select>
        </div>
      </div>
      
      <div class="mt-4 flex justify-between items-center pt-3 border-t border-white/5">
        <button onclick="event.preventDefault(); event.stopPropagation(); deleteManualMatch(${m.id})" class="text-red-500/70 hover:text-red-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          Eliminar
        </button>
        <div class="flex gap-3">
          <div class="flex items-center gap-2 mr-4 border-r border-white/10 pr-4">
             <label class="text-[9px] font-bold text-gray-500 uppercase">Estado</label>
             <select id="edit-status-${m.id}" class="bg-transparent text-gray-400 text-[10px] border-none focus:ring-0 cursor-pointer p-0">
               <option value="scheduled" ${m.status !== 'played' ? 'selected' : ''}>Programado</option>
               <option value="played" ${m.status === 'played' ? 'selected' : ''}>Jugado</option>
             </select>
          </div>
          <button onclick="event.preventDefault(); event.stopPropagation(); saveMatchEdit(${m.id})" class="btn-primary text-[10px] py-1.5 px-4 uppercase tracking-widest font-black">
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>`;
  }

  const played = m.status === 'played';
  const scoreBadge = m.matchTime ? `<span class="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">${m.matchTime} hs</span>` : '';
  const dateText = m.matchDate ? `<span class="text-[10px] text-gray-600 font-medium">${formatDateShort(m.matchDate)}</span>` : '';
  const zoneBadge = m.groupName ? `<span class="text-[10px] font-black text-gray-400 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded select-none uppercase tracking-wider">Zona ${m.groupName}</span>` : '';

  if (played) {
    const scoreClass = m.homeGoals > m.awayGoals ? 'win-home' : m.homeGoals < m.awayGoals ? 'win-away' : '';
    return `<div class="match-card-wrapper" id="match-wrapper-${m.id}">
      <div class="match-card played" id="match-${m.id}">
        <div class="match-team home flex items-center justify-end gap-3 text-right font-bold text-sm">
          <span>${escapeHTML(m.homeTeamName)}</span>
          ${m.homeShield ? `<img src="${escapeAttr(m.homeShield)}" class="w-10 h-10 object-contain" />` : ''}
        </div>
        <div class="flex flex-col items-center gap-1">
          <div class="match-score ${scoreClass}">
            <span>${m.homeGoals}</span>
            <span class="match-score-sep">–</span>
            <span>${m.awayGoals}</span>
          </div>
          <div class="flex items-center gap-1.5 justify-center flex-wrap">
            ${zoneBadge}
            ${m.penaltiesInfo ? `<span class="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded shadow-sm">${escapeHTML(m.penaltiesInfo)}</span>` : ''}
            <button onclick="toggleGoalsPanel(${m.id}, ${m.homeTeamId}, ${m.awayTeamId})"
                    class="goals-toggle-btn text-xs text-gray-500 hover:text-pitch-400 flex items-center gap-1 transition-colors"
                    id="goals-btn-${m.id}">
              <span class="text-sm">⚽</span> Goles
            </button>
            <button onclick="toggleCardsPanel(${m.id}, ${m.homeTeamId}, ${m.awayTeamId})"
                    class="cards-toggle-btn text-xs text-gray-500 hover:text-amber-400 flex items-center gap-1 transition-colors"
                    id="cards-btn-${m.id}">
              <span class="text-sm">🟡</span> Tarjetas
            </button>
            <button onclick="resetMatchResult(${m.id})" class="text-gray-600 hover:text-gray-400 text-xs ml-2" title="Resetear resultado">✕</button>
          </div>
        </div>
        <div class="match-team away flex items-center justify-start gap-3 text-left font-bold text-sm">
          ${m.awayShield ? `<img src="${escapeAttr(m.awayShield)}" class="w-10 h-10 object-contain" />` : ''}
          ${m.awayTeamId ? `<span>${escapeHTML(m.awayTeamName)}</span>` : '<span class="text-gray-600 italic">LIBRE</span>'}
        </div>
      </div>
      <div id="goals-panel-${m.id}" class="goals-panel hidden"></div>
      <div id="cards-panel-${m.id}" class="cards-panel hidden"></div>
    </div>`;
  }

  return `<div class="match-card-wrapper" id="match-wrapper-${m.id}">
    <div class="match-card" id="match-${m.id}">
      <div class="match-team home flex items-center justify-end gap-3 text-right">
        <span class="text-sm font-semibold text-gray-200">${escapeHTML(m.homeTeamName)}</span>
        ${m.homeShield ? `<img src="${escapeAttr(m.homeShield)}" class="w-8 h-8 object-contain" />` : ''}
      </div>
      
      <div class="flex flex-col items-center gap-2 min-w-[120px]">
        <div class="flex items-center gap-1 justify-center flex-wrap">
          ${zoneBadge}
          ${dateText}
          ${scoreBadge}
        </div>
        <div class="match-score">
          <input type="number" min="0" max="99" class="goals-input" id="hg-${m.id}" placeholder="–" />
          <span class="match-score-sep">–</span>
          <input type="number" min="0" max="99" class="goals-input" id="ag-${m.id}" placeholder="–" />
          <button onclick="saveMatchResult(${m.id})" class="ml-1 text-pitch-400 hover:text-pitch-300 font-bold text-lg" title="Guardar">✓</button>
        </div>
      </div>

      <div class="match-team away flex items-center justify-start gap-3 text-left">
        ${m.awayShield ? `<img src="${escapeAttr(m.awayShield)}" class="w-8 h-8 object-contain" />` : ''}
        ${m.awayTeamId ? `<span class="text-sm font-semibold text-gray-200">${escapeHTML(m.awayTeamName)}</span>` : '<span class="text-gray-600 italic text-sm">(VACANTE)</span>'}
      </div>
    </div>
  </div>`;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}


window.saveMatchResult = async function (matchId) {
  const hg = document.getElementById(`hg-${matchId}`);
  const ag = document.getElementById(`ag-${matchId}`);
  if (!hg || !ag) return;
  const homeGoals = parseInt(hg.value, 10);
  const awayGoals = parseInt(ag.value, 10);
  if (!Number.isInteger(homeGoals) || homeGoals < 0 || !Number.isInteger(awayGoals) || awayGoals < 0) {
    showToast('Ingresá goles válidos para ambos equipos.', 'error');
    return;
  }
  try {
    await fetchJSON(`/api/fixture/matches/${matchId}/result`, {
      method: 'PUT',
      body: JSON.stringify({ homeGoals, awayGoals }),
    });
    showToast('Resultado guardado', 'success');
    renderFixtureContent();
  } catch (e) {
    showToast('Error al guardar el resultado.', 'error');
  }
};

window.resetMatchResult = async function (matchId) {
  try {
    await fetchJSON(`/api/fixture/matches/${matchId}/result`, { method: 'DELETE' });
    showToast('Resultado eliminado', 'success');
    renderFixtureContent();
  } catch (e) {
    showToast('Error al resetear el resultado.', 'error');
  }
};

window.saveMatchEdit = async function (matchId) {
  const homeId = document.getElementById(`edit-home-${matchId}`).value;
  const awayId = document.getElementById(`edit-away-${matchId}`).value;
  const date = document.getElementById(`edit-date-${matchId}`).value;
  const time = document.getElementById(`edit-time-${matchId}`).value;
  const status = document.getElementById(`edit-status-${matchId}`).value;

  try {
    await fetchJSON(`/api/fixture/matches/${matchId}`, {
      method: 'PUT',
      body: JSON.stringify({
        homeTeamId: Number(homeId),
        awayTeamId: awayId ? Number(awayId) : null,
        matchDate: date || null,
        matchTime: time || null,
        status: status
      })
    });
    showToast('Partido actualizado', 'success');
    renderFixtureContent();
  } catch (err) {
    showToast('Error al actualizar partido: ' + err.message, 'error');
  }
};

window.addManualMatch = async function (tournamentId, roundNumber) {
  // We need at least one team. Let's pick the first one from fixture.teams
  if (!fixture.teams || !fixture.teams.length) return showToast('No hay equipos cargados.', 'error');

  try {
    await fetchJSON(`/api/fixture/tournaments/${tournamentId}/matches`, {
      method: 'POST',
      body: JSON.stringify({
        roundNumber,
        homeTeamId: fixture.teams[0].id,
        awayTeamId: fixture.teams[1] ? fixture.teams[1].id : null,
        matchDate: '',
        matchTime: ''
      })
    });
    showToast('Partido agregado', 'success');
    renderFixtureContent();
  } catch (err) {
    showToast('Error al agregar partido.', 'error');
  }
};

window.deleteManualMatch = function (matchId) {
  openDeleteModal('match', matchId);
};

window.handleGenerateT2 = async function () {
  if (!fixture.t1Id) return;
  try {
    const result = await fetchJSON(`/api/fixture/tournaments/${fixture.t1Id}/generate-t2`, { method: 'POST' });
    showToast(`Zonas asignadas: A(${result.groupA.length}) · B(${result.groupB.length})`, 'success');
    await loadFixture();
  } catch (e) {
    showToast('Error al generar las zonas del Torneo 2.', 'error');
  }
};

// Bind fixture sub-nav events — called from bindEvents() above

/* ═══════════════════════════════════════════════════════
   PLAYERS MODULE
════════════════════════════════════════════════════════ */

function positionIcon(pos) {
  if (!pos) return '⚽';
  if (pos === 'Arquero') return '🧤';
  if (pos === 'Defensor') return '🛡️';
  if (pos === 'Mediocampista') return '🏃';
  if (pos === 'Delantero') return '⚡';
  return '⚽';
}

window.togglePlantel = async function (teamId, btn) {
  const panel = document.getElementById(`plantel-${teamId}`);
  if (!panel) return;
  const isOpen = !panel.classList.contains('hidden');
  const chevron = btn.querySelector('.plantel-chevron');

  if (isOpen) {
    panel.classList.add('hidden');
    if (chevron) chevron.style.transform = '';
    return;
  }

  panel.classList.remove('hidden');
  if (chevron) chevron.style.transform = 'rotate(180deg)';
  await loadPlantel(teamId);
};

async function loadPlantel(teamId) {
  const listEl = document.getElementById(`player-list-${teamId}`);
  if (!listEl) return;
  try {
    const players = await fetchJSON(`/api/teams/${teamId}/players`);
    renderPlayerList(teamId, players);
  } catch (e) {
    listEl.innerHTML = '<span class="text-red-400">Error cargando plantel.</span>';
  }
}

function renderPlayerList(teamId, players) {
  const listEl = document.getElementById(`player-list-${teamId}`);
  if (!listEl) return;

  if (!players.length) {
    listEl.innerHTML = '<p class="text-gray-600 py-2">Sin jugadores cargados todavía.</p>';
    return;
  }

  listEl.innerHTML = `<ul class="player-list space-y-1">
    ${players.map(p => `
      <li class="player-row" id="player-row-${p.id}">
        <span class="player-number">${p.number != null ? `#${p.number}` : '·'}</span>
        <span class="player-pos-icon" title="${escapeHTML(p.position)}">${positionIcon(p.position)}</span>
        <span class="player-name">${escapeHTML(p.name)}</span>
        <span class="player-pos-label">${escapeHTML(p.position || '')}</span>
        <button onclick="deletePlayer(${p.id}, ${teamId})" class="player-delete-btn" title="Eliminar">🗑️</button>
      </li>
    `).join('')}
  </ul>`;
}

window.handleAddPlayer = async function (event, teamId) {
  event.preventDefault();
  const form = event.currentTarget;
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  if (!name) { showToast('El nombre es obligatorio.', 'error'); return; }
  const numberRaw = parseInt(fd.get('number'), 10);
  const number = Number.isInteger(numberRaw) && numberRaw >= 0 ? numberRaw : null;
  const position = String(fd.get('position') || '').trim();

  try {
    await fetchJSON(`/api/teams/${teamId}/players`, {
      method: 'POST',
      body: JSON.stringify({ name, number, position }),
    });
    form.reset();
    showToast('Jugador agregado ✓', 'success');
    await loadPlantel(teamId);
  } catch (e) {
    showToast('Error al agregar el jugador.', 'error');
  }
};

window.deletePlayer = function (playerId, teamId) {
  openDeleteModal('player', playerId, teamId);
};

/* ═══════════════════════════════════════════════════════
   MATCH CARDS PANEL
════════════════════════════════════════════════════════ */

window.toggleCardsPanel = async function (matchId, homeTeamId, awayTeamId) {
  const panel = document.getElementById(`cards-panel-${matchId}`);
  const btn = document.getElementById(`cards-btn-${matchId}`);
  if (!panel) return;

  const isOpen = !panel.classList.contains('hidden');
  if (isOpen) {
    panel.classList.add('hidden');
    if (btn) btn.classList.remove('text-amber-400');
    return;
  }

  panel.classList.remove('hidden');
  if (btn) btn.classList.add('text-amber-400');
  panel.innerHTML = '<div class="text-center text-gray-600 py-4 text-xs animate-pulse">Cargando plantel...</div>';

  try {
    const data = await fetchJSON(`/api/fixture/matches/${matchId}/cards`);
    panel.innerHTML = renderCardsPanelHtml(matchId, data);
  } catch (e) {
    panel.innerHTML = '<p class="text-red-400 text-xs text-center py-3">Error al cargar las tarjetas.</p>';
  }
};

function renderCardsPanelHtml(matchId, data) {
  if (!data) return '<p class="text-gray-500 text-xs text-center py-3">Partido no encontrado.</p>';
  const { homeTeam, awayTeam } = data;

  function teamColumn(team) {
    if (!team) return '<div class="text-gray-600 text-xs">Sin datos</div>';
    if (!team.players.length) {
      return `<div>
        <p class="text-xs font-bold text-gray-400 mb-2">${escapeHTML(team.name)}</p>
        <p class="text-xs text-gray-600">Sin jugadores en el plantel.</p>
      </div>`;
    }
    const rows = team.players.map(p => {
      const yellowBadges = p.matchYellows.map(c =>
        `<span class="card-badge yellow" onclick="removeMatchCard(${c.id}, ${matchId})" title="Quitar tarjeta">🟡</span>`
      ).join('');
      const redBadges = p.matchReds.map(c =>
        `<span class="card-badge red" onclick="removeMatchCard(${c.id}, ${matchId})" title="Quitar tarjeta${c.suspensionMatches ? ` (${c.suspensionMatches} fechas)` : ''}">🔴${c.suspensionMatches ? `<sub style="bottom:0; font-size:9px; font-weight:normal; margin-left:1px">${c.suspensionMatches}</sub>` : ''}</span>`
      ).join('');

      const tourInfo = (p.tourYellows > 0 || p.tourReds > 0)
        ? `<span class="tour-card-tip" title="Acumulados en el torneo">${p.tourYellows > 0 ? `🟡×${p.tourYellows}` : ''}${p.tourReds > 0 ? ` 🔴×${p.tourReds}` : ''}</span>`
        : '';
      const suspendedBadge = p.suspended ? ' <span class="suspended-badge">⚠️ Susp.</span>' : '';

      return `<div class="card-player-row">
        <span class="player-number-sm">${p.number != null ? `#${p.number}` : '·'}</span>
        <span class="card-player-name">${escapeHTML(p.name)}${suspendedBadge}</span>
        ${tourInfo}
        <div class="card-actions">
          ${yellowBadges}${redBadges}
          <button onclick="addMatchCard(${matchId}, ${p.id}, ${team.id}, 'yellow')" class="card-add-btn yellow" title="Amarilla">+🟡</button>
          <button onclick="addMatchCard(${matchId}, ${p.id}, ${team.id}, 'red')" class="card-add-btn red" title="Roja">+🔴</button>
        </div>
      </div>`;
    }).join('');

    return `<div>
      <p class="text-xs font-bold text-gray-300 mb-2">${escapeHTML(team.name)}</p>
      <div class="space-y-0.5">${rows}</div>
    </div>`;
  }

  return `<div class="cards-panel-content">
    <div class="mb-3 px-1">
      <div class="relative">
        <span class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
        <input type="text" 
               placeholder="Buscar por nombre..." 
               oninput="window.filterPlayers(this, ${matchId})"
               class="w-full bg-surface-900/80 border border-white/5 rounded-lg pl-9 pr-3 py-1.5 text-[11px] text-gray-200 focus:outline-none focus:border-amber-500/30 transition-all placeholder:text-gray-600" />
      </div>
    </div>
    <div class="cards-columns">
      ${teamColumn(homeTeam)}
      <div class="cards-divider"></div>
      ${teamColumn(awayTeam)}
    </div>
  </div>`;
}

window.filterPlayers = function (input, matchId) {
  const term = input.value.toLowerCase().trim();
  const panel = document.getElementById(`cards-panel-${matchId}`);
  if (!panel) return;
  const rows = panel.querySelectorAll('.card-player-row');
  rows.forEach(row => {
    const name = row.querySelector('.card-player-name').textContent.toLowerCase();
    row.classList.toggle('hidden', term !== '' && !name.includes(term));
  });
};

window.filterDropdown = function (input, selectId) {
  const term = input.value.toLowerCase().trim();
  const select = document.getElementById(selectId);
  if (!select) return;
  const optGroups = select.querySelectorAll('optgroup');
  optGroups.forEach(group => {
    let groupVisible = false;
    group.querySelectorAll('option').forEach(opt => {
      if (opt.value === "") return;
      const isMatch = opt.textContent.toLowerCase().includes(term);
      opt.hidden = !isMatch;
      if (isMatch) groupVisible = true;
    });
    group.hidden = !groupVisible && term !== '';
  });
};


async function refreshCardsPanel(matchId) {
  const panel = document.getElementById(`cards-panel-${matchId}`);
  if (!panel) return;
  const term = panel.querySelector('input')?.value || '';
  try {
    const data = await fetchJSON(`/api/fixture/matches/${matchId}/cards`);
    panel.innerHTML = renderCardsPanelHtml(matchId, data);
    if (term) {
      const input = panel.querySelector('input');
      if (input) {
        input.value = term;
        window.filterPlayers(input, matchId);
      }
    }
  } catch (e) {
    console.error(e);
  }
}


window.addMatchCard = async function (matchId, playerId, teamId, cardType) {
  let suspensionMatches = 0;
  let isPending = false;
  let details = null;

  if (cardType === 'red') {
    const input = prompt('¿Cuántas fechas de suspensión? (Escribí "P" para Pendiente de Tribunal)', '1');
    if (input === null) return; // Se canceló

    const normalizedInput = input.trim().toLowerCase();
    if (normalizedInput === 'p' || normalizedInput === 'pendiente') {
      isPending = true;
      suspensionMatches = 0;
    } else {
      suspensionMatches = parseInt(input, 10);
      if (isNaN(suspensionMatches) || suspensionMatches < 0) {
        showToast('Cantidad de fechas inválida', 'error');
        return;
      }
    }
    
    const detailsInput = prompt('¿Detalle de la sanción (Opcional, ej. Doble Amarilla)?');
    if (detailsInput !== null && detailsInput.trim() !== '') {
      details = detailsInput.trim();
    }
  }

  try {
    await fetchJSON(`/api/fixture/matches/${matchId}/cards`, {
      method: 'POST',
      body: JSON.stringify({ playerId, teamId, cardType, suspensionMatches, isPending, details }),
    });
    await refreshCardsPanel(matchId);
  } catch (e) {
    showToast('Error al registrar la tarjeta.', 'error');
  }
};

window.removeMatchCard = async function (cardId, matchId) {
  try {
    await fetchJSON(`/api/fixture/cards/${cardId}`, { method: 'DELETE' });
    await refreshCardsPanel(matchId);
  } catch (e) {
    showToast('Error al quitar la tarjeta.', 'error');
  }
};

/* ── EDIT MOVEMENT ── */
window.handleEditMovement = function (movement) {
  const form = els.movementForm;
  if (!form) return;

  // Populate basic fields
  form.elements.id.value = movement.id;
  form.elements.date.value = formatDateForInput(movement.date || movement.occurredOn);
  form.elements.amount.value = ((movement.amountCents || movement.amount || 0) / 100).toFixed(2);
  form.elements.description.value = movement.description || '';

  if (movement.teamId) {
    form.elements.teamId.value = movement.teamId;
  } else {
    form.elements.teamId.value = '';
  }

  // Set type toggle
  setType(movement.type);

  // Category select/custom
  const catSelect = els.categorySelect;
  const categories = Array.from(catSelect.options).map(o => o.value);
  const movementCategory = movement.category;
  if (categories.includes(movementCategory)) {
    catSelect.value = movementCategory;
    els.categoryCustomInput.classList.add('hidden');
  } else {
    catSelect.value = '__otro__';
    els.categoryCustomInput.value = movementCategory;
    els.categoryCustomInput.classList.remove('hidden');
  }

  // Method select/custom
  const methSelect = els.methodSelect;
  const methods = Array.from(methSelect.options).map(o => o.value);
  const movementMethod = movement.method || movement.paymentMethod;
  if (methods.includes(movementMethod)) {
    methSelect.value = movementMethod;
    els.methodCustomInput.classList.add('hidden');
  } else {
    methSelect.value = '__otro__';
    els.methodCustomInput.value = movementMethod;
    els.methodCustomInput.classList.remove('hidden');
  }

  // UI status
  if (els.submitBtnText) els.submitBtnText.textContent = 'Actualizar movimiento';
  if (els.cancelEditBtn) els.cancelEditBtn.classList.remove('hidden');

  // Switch to register tab to see the form
  switchTab('registrar');

  // Re-render movements to show highlight
  renderMovements();
};

window.cancelEditMovement = function () {
  const form = els.movementForm;
  if (!form) return;

  form.reset();
  form.elements.id.value = '';
  initDefaults();
  setType('income');

  els.categoryCustomInput?.classList.add('hidden');
  els.methodCustomInput?.classList.add('hidden');

  if (els.submitBtnText) els.submitBtnText.textContent = 'Guardar movimiento';
  if (els.cancelEditBtn) els.cancelEditBtn.classList.add('hidden');

  renderMovements();
};

window.toggleMovementsEditMode = function (forceState = null) {
  state.movementsEditEnabled = forceState !== null ? forceState : !state.movementsEditEnabled;

  if (els.movementsEditToggle) {
    els.movementsEditToggle.checked = state.movementsEditEnabled;
  }

  if (state.movementsEditEnabled) {
    showToast('Edición de movimientos activada [E]', 'success');
  } else {
    showToast('Edición de movimientos desactivada', 'info');
    cancelEditMovement();
  }

  renderMovements();
};

function formatDateForInput(dateStr) {
  if (!dateStr) return '';
  // Convert from potential ISO or YYYY-MM-DD
  return dateStr.slice(0, 10);
}

// ── GOALS MANAGEMENT ──

window.toggleGoalsPanel = async function (matchId, homeTeamId, awayTeamId) {
  const panel = document.getElementById(`goals-panel-${matchId}`);
  if (!panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
    return;
  }

  // Hide cards panel if open
  const cardsPanel = document.getElementById(`cards-panel-${matchId}`);
  if (cardsPanel) cardsPanel.classList.add('hidden');

  panel.innerHTML = '<div class="p-4 text-center text-gray-600 italic text-xs">Cargando goles...</div>';
  panel.classList.remove('hidden');

  await updateGoalsPanel(matchId, homeTeamId, awayTeamId);
};

async function updateGoalsPanel(matchId, homeTeamId, awayTeamId) {
  const panel = document.getElementById(`goals-panel-${matchId}`);
  const oldTerm = panel.querySelector('input[placeholder="Filtrar jugadores..."]')?.value || '';
  try {
    const [playersRes, goalsRes] = await Promise.all([
      fetch('/api/players'),
      fetch(`/api/fixture/matches/${matchId}/goals`)
    ]);
    const allPlayersData = await playersRes.json();
    const matchGoalsData = await goalsRes.json();
    const allPlayers = Array.isArray(allPlayersData) ? allPlayersData : [];

    // Flatten goals from the structured nested response
    const matchGoals = [];
    if (matchGoalsData.homeTeam && matchGoalsData.homeTeam.players) {
      matchGoalsData.homeTeam.players.forEach(p => {
        if (p.goals) matchGoals.push(...p.goals);
      });
    }
    if (matchGoalsData.awayTeam && matchGoalsData.awayTeam.players) {
      matchGoalsData.awayTeam.players.forEach(p => {
        if (p.goals) matchGoals.push(...p.goals);
      });
    }
    matchGoals.sort((a, b) => (a.minute || 0) - (b.minute || 0));

    const homePlayers = allPlayers.filter(p => Number(p.teamId) === Number(homeTeamId));
    const awayPlayers = allPlayers.filter(p => Number(p.teamId) === Number(awayTeamId));

    panel.innerHTML = renderGoalsPanelHtml(matchId, homePlayers, awayPlayers, matchGoals, homeTeamId, awayTeamId);
    
    // Restore and apply filter if exists
    if (oldTerm) {
      const input = panel.querySelector('input[placeholder="Filtrar jugadores..."]');
      if (input) {
        input.value = oldTerm;
        window.filterDropdown(input, `goal-player-${matchId}`);
      }
    }
  } catch (err) {
    console.error(err);
    panel.innerHTML = '<div class="p-4 text-red-400 text-xs">Error al cargar goles</div>';
  }
}

function renderGoalsPanelHtml(matchId, homePlayers, awayPlayers, goals, homeTeamId, awayTeamId) {
  const homeOptions = homePlayers.map(p => `<option value="${p.id}" data-team-id="${p.teamId}">${escapeHTML(p.name)}</option>`).join('');
  const awayOptions = awayPlayers.map(p => `<option value="${p.id}" data-team-id="${p.teamId}">${escapeHTML(p.name)}</option>`).join('');

  const goalsList = goals.map(g => `
    <div class="flex items-center justify-between py-1 px-2 bg-surface-900/40 rounded mb-1 border border-white/5">
      <div class="flex items-center gap-2">
        <span class="text-pitch-400 text-[10px] font-bold">${g.minute}'</span>
        <span class="text-xs text-gray-300">${escapeHTML(g.playerName)}</span>
        <span class="text-[9px] text-gray-500 uppercase tracking-tighter">(${escapeHTML(g.teamName)})</span>
      </div>
      <button onclick="removeMatchGoal(${g.id}, ${matchId}, ${homeTeamId}, ${awayTeamId})" class="text-gray-600 hover:text-red-400 transition-colors">✕</button>
    </div>
  `).join('');

  return `
    <div class="p-4 bg-surface-800/50 border-t border-white/5 rounded-b-xl border-x border-b border-pitch-500/10">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
        <div>
          <h4 class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Registrar Gol</h4>
          <div class="flex flex-col gap-2">
            <input type="text" 
                   placeholder="Filtrar jugadores..." 
                   oninput="window.filterDropdown(this, 'goal-player-${matchId}')"
                   class="bg-surface-900 border border-white/10 rounded px-2 py-1 text-[10px] text-gray-400 focus:outline-none focus:border-pitch-500/50 mb-1" />
            <select id="goal-player-${matchId}" class="bg-surface-900 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-pitch-500/50">
              <option value="">Seleccionar Jugador...</option>
              <optgroup label="Local">
                ${homeOptions}
              </optgroup>
              <optgroup label="Visitante">
                ${awayOptions}
              </optgroup>
            </select>
            <div class="flex gap-2">
              <input type="number" id="goal-min-${matchId}" placeholder="Min." class="w-16 bg-surface-900 border border-white/10 rounded px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-pitch-500/50" />
              <button onclick="addMatchGoal(${matchId}, ${homeTeamId}, ${awayTeamId})" class="flex-1 bg-pitch-600 hover:bg-pitch-500 text-white text-[10px] font-bold uppercase tracking-wider rounded transition-all py-1.5">Agregar Gol</button>
            </div>
          </div>
        </div>
        <div>
          <h4 class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Detalle de Goles</h4>
          <div class="max-h-[120px] overflow-y-auto custom-scrollbar pr-1">
            ${goalsList || '<div class="text-[10px] text-gray-600 italic text-center py-4">Sin goles registrados</div>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

window.addMatchGoal = async function (matchId, homeTeamId, awayTeamId) {
  const playerIdSelect = document.getElementById(`goal-player-${matchId}`);
  const minuteInput = document.getElementById(`goal-min-${matchId}`);
  const playerId = playerIdSelect.value;
  const minute = minuteInput.value;

  if (!playerId) {
    showToast('Selecciona un jugador', 'error');
    return;
  }

  const selectedOption = playerIdSelect.options[playerIdSelect.selectedIndex];
  const teamId = selectedOption.dataset.teamId;

  try {
    const res = await fetch(`/api/fixture/matches/${matchId}/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: parseInt(playerId),
        teamId: parseInt(teamId),
        minute: parseInt(minute) || 0
      })
    });

    if (res.ok) {
      showToast('Gol registrado');
      await updateGoalsPanel(matchId, homeTeamId, awayTeamId);
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al registrar gol', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Error al registrar gol', 'error');
  }
};

window.removeMatchGoal = async function (goalId, matchId, homeTeamId, awayTeamId) {
  if (!confirm('¿Eliminar registro de gol?')) return;

  try {
    const res = await fetch(`/api/fixture/goals/${goalId}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Gol eliminado');
      await updateGoalsPanel(matchId, homeTeamId, awayTeamId);
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al eliminar gol', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Error al eliminar gol', 'error');
  }
};

/* ── STATS REPORT (PDF) ── */
async function openStatsReportModal() {
  if (!els.modalStatsPdf || !els.selectReportFecha) return;

  try {
    const tournamentId = state.currentTournamentId === 'all' ? 1 : state.currentTournamentId;
    const res = await fetch(`/api/stats/current-round?tournamentId=${tournamentId}`);
    if (!res.ok) throw new Error('Error al obtener fecha actual');
    const { currentRound } = await res.json();
    
    els.selectReportFecha.innerHTML = Array.from({ length: currentRound }, (_, i) => `<option value="${i + 1}">Fecha ${i + 1}</option>`).join('');
  } catch (err) {
    console.error(err);
    const maxRound = state.currentTournamentType === 'zonas' ? 5 : 15;
    els.selectReportFecha.innerHTML = Array.from({ length: maxRound }, (_, i) => `<option value="${i + 1}">Fecha ${i + 1}</option>`).join('');
  }

  els.modalStatsPdf.classList.remove('hidden');
}

async function generateStatsReport() {
  const round = parseInt(els.selectReportFecha.value, 10);
  els.modalStatsPdf.classList.add('hidden');
  showToast(`Generando reporte Fecha ${round}...`, 'info');

  try {
    const tournamentId = state.currentTournamentId === 'all' ? 1 : state.currentTournamentId;
    const isZonas = state.currentTournamentType === 'zonas';
    const simulateDeduction = els.statsSimulateDeduction && els.statsSimulateDeduction.checked;

    const standingsPromises = isZonas ? [
      fetch(`/api/stats/standings?tournamentId=${tournamentId}&group=A${simulateDeduction ? '&simulateDeduction=true' : ''}`),
      fetch(`/api/stats/standings?tournamentId=${tournamentId}&group=B${simulateDeduction ? '&simulateDeduction=true' : ''}`)
    ] : [
      fetch(`/api/stats/standings?tournamentId=${tournamentId}${simulateDeduction ? '&simulateDeduction=true' : ''}`)
    ];

    const [
      scorersRes,
      cardsRes,
      suspendedRes,
      detailedResultsRes,
      ...standingsResList
    ] = await Promise.all([
      fetch(`/api/stats/scorers?tournamentId=${state.currentTournamentId}`),
      fetch(`/api/stats/cards?tournamentId=${state.currentTournamentId}`),
      fetch(`/api/stats/suspended?tournamentId=${state.currentTournamentId}`),
      fetch(`/api/stats/results?tournamentId=${tournamentId}&round=${round}`),
      ...standingsPromises
    ]);

    const scorers = await scorersRes.json();
    const cards = await cardsRes.json();
    const suspended = await suspendedRes.json();
    const roundResults = await detailedResultsRes.json();

    let standingsA = null;
    let standingsB = null;
    let standingsSingle = null;

    if (isZonas) {
      standingsA = await standingsResList[0].json();
      standingsB = await standingsResList[1].json();
    } else {
      standingsSingle = await standingsResList[0].json();
    }

    const tournamentName = document.getElementById('tournamentName')?.textContent || 'Torneo Apertura 2026';

    const renderStandingRow = (s, idx, showBadges = true) => `
      <tr>
        <td class="font-bold text-gray-600">${idx + 1}</td>
        <td>
          <div class="flex items-center gap-3">
            <img src="${s.shieldUrl || './escudo-default.png'}" class="w-6 h-6 object-contain">
            <span class="font-bold text-white flex items-center gap-1.5">
              ${escapeHTML(s.name)}
              ${showBadges && idx === 0 
                ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm ml-1 select-none font-sans" title="Campeón">C</span>` 
                : ''
              }
              ${showBadges && s.pointsDeduction
                ? `<span class="text-red-500 font-extrabold text-sm ml-1 select-none" title="Equipos con sanción pendiente de cumplimiento, quedando sujetos a la quita de los puntos obtenidos entre la Fecha 1 y la Fecha 9 inclusive, conforme al reglamento vigente.">*</span>`
                : ''
              }
            </span>
          </div>
        </td>
        <td class="text-center text-gray-400">${s.played}</td>
        <td class="text-center font-bold" style="color: #10b981 !important;">${s.won}</td>
        <td class="text-center font-bold" style="color: #f59e0b !important;">${s.draw}</td>
        <td class="text-center font-bold" style="color: #ef4444 !important;">${s.lost}</td>
        <td class="text-center font-bold" style="color: #10b981 !important;">${s.goalsFor}</td>
        <td class="text-center font-bold" style="color: #ef4444 !important;">${s.goalsAgainst}</td>
        <td class="text-center font-mono font-bold" style="color: ${s.goalDiff >= 0 ? '#10b981 !important' : '#ef4444 !important'};">${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</td>
        <td class="text-right font-black text-white text-lg">${s.points}</td>
      </tr>
    `;

    const html = `
        <div class="report-header">
          <div class="flex items-center gap-8">
            <img src="./logo-torneo.png" class="w-32 h-32 object-contain">
            <div>
              <div class="text-4xl font-black text-white leading-none tracking-tighter mb-2">TORNEO +30</div>
              <div class="report-title text-2xl font-bold mt-1">REPORTE SEMANAL</div>
              <div class="text-emerald-400 font-bold tracking-widest text-xs mt-1 uppercase">${tournamentName}</div>
              <div class="text-gray-600 font-bold tracking-tight text-[8px] uppercase mt-1">DYDLABS sistemas e inteligencia artificial</div>
            </div>
          </div>
          <div class="report-header-info">
            <h2 class="text-white">FECHA ${round}</h2>
            <p>${new Date().toLocaleDateString('es-AR')}</p>
          </div>
        </div>

        <div class="mb-10">
          <div class="report-section-title">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            Resultados de la Fecha
          </div>
          <div class="space-y-4">
            ${roundResults.map(m => {
      // Group goals for display
      const homeGoalsGrouped = m.goals?.filter(g => g.teamId === m.homeTeamId).reduce((acc, g) => {
        acc[g.playerName] = (acc[g.playerName] || 0) + 1;
        return acc;
      }, {}) || {};
      const awayGoalsGrouped = m.goals?.filter(g => g.teamId === m.awayTeamId).reduce((acc, g) => {
        acc[g.playerName] = (acc[g.playerName] || 0) + 1;
        return acc;
      }, {}) || {};

      const homeCards = m.cards?.filter(c => c.teamId === m.homeTeamId) || [];
      const awayCards = m.cards?.filter(c => c.teamId === m.awayTeamId) || [];

      return `
                <div class="report-match-card report-card">
                  <div class="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
                    <div class="flex items-center gap-3 flex-1">
                      <img src="${m.homeTeamShield || './escudo-default.png'}" class="w-8 h-8 object-contain">
                      <div class="text-xs font-black text-white uppercase tracking-tight">${escapeHTML(m.homeTeamName)}</div>
                    </div>
                    <div class="flex items-center gap-2 bg-surface-900 border border-white/10 rounded-xl px-4 py-2 mx-4">
                      <span class="text-xl font-black text-white">${m.status === 'played' ? m.homeScore : '-'}</span>
                      <span class="text-gray-600 font-bold">:</span>
                      <span class="text-xl font-black text-white">${m.status === 'played' ? m.awayScore : '-'}</span>
                    </div>
                    <div class="flex items-center gap-3 flex-1 justify-end">
                      <div class="text-xs font-black text-white uppercase tracking-tight text-right">${escapeHTML(m.awayTeamName)}</div>
                      <img src="${m.awayTeamShield || './escudo-default.png'}" class="w-8 h-8 object-contain">
                    </div>
                  </div>

                  <div class="grid grid-cols-2 gap-6">
                    <!-- Home Events -->
                    <div class="space-y-1.5 border-r border-white/5 pr-3">
                      ${Object.entries(homeGoalsGrouped).map(([name, qty]) => `
                        <div class="flex items-center gap-2 text-[10px] text-gray-300 font-bold">
                          <span class="text-emerald-400">⚽</span>
                          <span>${escapeHTML(name)} ${qty > 1 ? `x${qty}` : ''}</span>
                        </div>
                      `).join('')}
                      ${homeCards.map(c => `
                        <div class="flex items-center gap-2 text-[10px] text-gray-300 font-bold">
                          <span class="text-[10px]">${c.cardType === 'yellow' ? '🟨' : '🔴'}</span>
                          <span>${escapeHTML(c.playerName)}</span>
                        </div>
                      `).join('')}
                    </div>
                    <!-- Away Events -->
                    <div class="space-y-1.5 pl-3">
                      ${Object.entries(awayGoalsGrouped).map(([name, qty]) => `
                        <div class="flex items-center gap-2 text-[10px] text-gray-300 font-bold justify-end">
                          <span>${escapeHTML(name)} ${qty > 1 ? `x${qty}` : ''}</span>
                          <span class="text-emerald-400">⚽</span>
                        </div>
                      `).join('')}
                      ${awayCards.map(c => `
                        <div class="flex items-center gap-2 text-[10px] text-gray-300 font-bold justify-end">
                          <span>${escapeHTML(c.playerName)}</span>
                          <span class="text-[10px]">${c.cardType === 'yellow' ? '🟨' : '🔴'}</span>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
              `;
    }).join('') || '<div class="text-gray-600 italic p-4 col-span-2 text-center">No hay partidos registrados para esta fecha.</div>'}
          </div>
        </div>

        <div class="report-grid">
          <!-- Standings -->
          ${isZonas ? `
            <div class="report-card col-span-2">
              <div class="report-section-title">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Tabla de Posiciones — Zona A
              </div>
              <table class="report-table">
                <thead>
                  <tr>
                    <th class="w-8">#</th>
                    <th>Equipo</th>
                    <th class="text-center">PJ</th>
                    <th class="text-center">PG</th>
                    <th class="text-center">PE</th>
                    <th class="text-center">PP</th>
                    <th class="text-center">GF</th>
                    <th class="text-center">GC</th>
                    <th class="text-center">DIF</th>
                    <th class="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  ${standingsA.map((s, idx) => renderStandingRow(s, idx, false)).join('')}
                </tbody>
              </table>
            </div>

            <div class="report-card col-span-2">
              <div class="report-section-title">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Tabla de Posiciones — Zona B
              </div>
              <table class="report-table">
                <thead>
                  <tr>
                    <th class="w-8">#</th>
                    <th>Equipo</th>
                    <th class="text-center">PJ</th>
                    <th class="text-center">PG</th>
                    <th class="text-center">PE</th>
                    <th class="text-center">PP</th>
                    <th class="text-center">GF</th>
                    <th class="text-center">GC</th>
                    <th class="text-center">DIF</th>
                    <th class="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  ${standingsB.map((s, idx) => renderStandingRow(s, idx, false)).join('')}
                </tbody>
              </table>
            </div>
          ` : `
            <div class="report-card col-span-2">
              <div class="report-section-title">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                Tabla de Posiciones
              </div>
              <table class="report-table">
                <thead>
                  <tr>
                    <th class="w-8">#</th>
                    <th>Equipo</th>
                    <th class="text-center">PJ</th>
                    <th class="text-center">PG</th>
                    <th class="text-center">PE</th>
                    <th class="text-center">PP</th>
                    <th class="text-center">GF</th>
                    <th class="text-center">GC</th>
                    <th class="text-center">DIF</th>
                    <th class="text-right">PTS</th>
                  </tr>
                </thead>
                <tbody>
                  ${standingsSingle.map((s, idx) => renderStandingRow(s, idx, true)).join('')}
                </tbody>
              </table>
              <div class="mt-3 pt-2 border-t border-white/5">
                <p class="text-[9px] text-red-400 font-medium leading-relaxed">
                  <span class="font-bold">(*)</span> Equipos con sanción pendiente de cumplimiento, quedando sujetos a la quita de los puntos obtenidos entre la Fecha 1 y la Fecha 9 inclusive, conforme al reglamento vigente.
                </p>
              </div>
            </div>
          `}

          <!-- Suspended -->
          <div class="report-card col-span-2">
            <div class="report-section-title text-amber-500">
              <svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
              Jugadores Suspendidos
            </div>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th class="text-center">Sanción</th>
                  <th class="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${suspended.length === 0 ? `
                  <tr>
                    <td colspan="3" class="text-center py-4 text-gray-400 font-bold bg-surface-900/30">👍 No hay jugadores suspendidos actualmente.</td>
                  </tr>
                ` : suspended.map(s => `
                  <tr>
                    <td>
                      <div class="flex items-center gap-3">
                        <img src="${s.shieldUrl || './escudo-default.png'}" class="w-6 h-6 object-contain">
                        <div>
                          <div class="font-bold text-white">${escapeHTML(s.playerName)}</div>
                          <div class="text-[9px] text-gray-500 uppercase font-bold">${escapeHTML(s.teamName)}</div>
                        </div>
                      </div>
                    </td>
                    <td class="text-center">
                      <div class="text-xs font-bold text-gray-300">${escapeHTML(s.suspensionType || 'Roja Directa')}</div>
                      <div class="text-[10px] text-gray-500 uppercase font-semibold mt-0.5">
                        ${s.isPending ? `Sanción: <span class="text-amber-500 font-bold">PENDIENTE</span> <span class="text-[9px] text-amber-500/60">(Cumplidas: ${s.servedMatches})</span>` : `Total: ${s.originalSuspension} fechas`}
                      </div>
                      <div class="text-[9px] text-gray-600 mt-1">Dada en Fecha ${s.cardRound}</div>
                    </td>
                    <td class="text-center">
                      <div class="inline-flex flex-col items-center gap-1">
                        <div class="flex items-center gap-1.5 text-red-500 font-black text-xs uppercase tracking-widest">
                          <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                          Suspendido
                        </div>
                        <div class="text-[10px] text-gray-400 font-semibold italic">
                          ${s.isPending ? `<span class="text-amber-500/80">Cumplidas: <span class="text-white font-bold">${s.servedMatches}</span></span>` : `Le quedan <span class="text-white font-bold">${s.remainingMatches}</span> <span class="text-[8px] text-gray-500">(Cumplidas: ${s.servedMatches})</span>`}
                        </div>
                      </div>
                    </td>

                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Scorers -->
          <div class="report-card">
            <div class="report-section-title">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
              Goleadores
            </div>
            <table class="report-table">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th class="text-right">Goles</th>
                </tr>
              </thead>
              <tbody>
                ${scorers.map(s => `
                  <tr>
                    <td>
                      <div class="flex items-center gap-3">
                        <img src="${s.shieldUrl || './escudo-default.png'}" class="w-6 h-6 object-contain">
                        <div>
                          <div class="font-bold text-white">${escapeHTML(s.playerName)}</div>
                          <div class="text-[9px] text-gray-500 uppercase font-bold">${escapeHTML(s.teamName)}</div>
                        </div>
                      </div>
                    </td>
                    <td class="text-right font-black text-amber-400 text-lg">${s.goals}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Disciplinary -->
          <div class="report-card">
            <div class="report-section-title">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
              Ranking Disciplinario
            </div>
            <table class="report-table">
               <thead>
                <tr>
                  <th>Jugador</th>
                  <th class="text-center">🟨</th>
                  <th class="text-center">🟥</th>
                </tr>
              </thead>
              <tbody>
                ${cards.map(c => `
                  <tr>
                    <td>
                      <div class="flex items-center gap-3">
                        <img src="${c.shieldUrl || './escudo-default.png'}" class="w-6 h-6 object-contain">
                        <div>
                          <div class="font-bold text-white">${escapeHTML(c.playerName)}</div>
                          <div class="text-[9px] text-gray-500 uppercase font-bold">${escapeHTML(c.teamName)}</div>
                        </div>
                      </div>
                    </td>
                    <td class="text-center">
                      <span class="bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-sm font-black text-[10px]">${c.yellowCards}</span>
                    </td>
                    <td class="text-center">
                      <span class="bg-red-600 text-white px-1.5 py-0.5 rounded-sm font-black text-[10px]">${c.redCards}</span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="mt-12 pt-8 border-t border-white/5 text-center">
          <div class="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-2">Generado por Torneo Management System - Apertura 2026</div>
          <div class="text-[9px] text-gray-600 uppercase tracking-[0.2em] font-black">POWERED BY DYDLABS - <a href="https://portafolio.dydlabs.com">Alexis Tomaselli </a></div>
        </div>
    `;

    // Inject into print container
    let container = document.getElementById('report-print-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'report-print-container';
      container.className = 'print-only';
      document.body.appendChild(container);
    }
    container.innerHTML = html;

    // Use a standardized title for the exported filename
    const originalTitle = document.title;
    const cleanTournamentName = tournamentName.replace(/[^a-z0-9]/gi, '-');
    const today = new Date().toISOString().split('T')[0];
    document.title = `Reporte-Semanal-${cleanTournamentName}-Fecha${round}-${today}`;

    // Use a small delay for CSS and images to apply
    setTimeout(() => {
      document.body.classList.add('is-printing-report');
      window.print();
      document.body.classList.remove('is-printing-report');
      container.innerHTML = '';
      document.title = originalTitle;
    }, 600);


  } catch (err) {
    console.error(err);
    showToast('Error al generar reporte', 'error');
  }
}

// ── STATS TAB LOGIC ──

async function loadTournamentPhases() {
  if (state.phasesLoaded) return;
  try {
    const res = await fetch('/api/phases');
    if (!res.ok) throw new Error('Error al cargar fases');
    const allPhases = await res.json();

    if (els.tournamentPhaseSelect) {
      els.tournamentPhaseSelect.innerHTML = '';

      allPhases.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.phaseTournamentId;
        opt.dataset.type = p.type;

        let cleanLabel = p.ptLabel;
        if (p.phaseId === 1 && p.type === 'todos_contra_todos' && !p.ptLabel.toLowerCase().includes('final')) cleanLabel = 'Torneo Largo Apertura';
        else if (p.phaseId === 1 && p.type === 'zonas') cleanLabel = 'Torneo Corto Apertura';
        else if (p.phaseId === 1 && p.ptLabel.toLowerCase().includes('final')) cleanLabel = '🏆 Gran Final Apertura';
        else if (p.phaseId === 3 && p.type === 'todos_contra_todos' && !p.ptLabel.toLowerCase().includes('final')) cleanLabel = 'Torneo Largo Clausura';
        else if (p.phaseId === 3 && p.type === 'zonas') cleanLabel = 'Torneo Corto Clausura';
        else if (p.phaseId === 3 && p.ptLabel.toLowerCase().includes('final')) cleanLabel = '🏆 Gran Final Clausura';

        opt.textContent = cleanLabel;
        els.tournamentPhaseSelect.appendChild(opt);
      });

      const optAll = document.createElement('option');
      optAll.value = 'all';
      optAll.dataset.type = 'global';
      optAll.textContent = 'Acumulado General (Anual)';
      els.tournamentPhaseSelect.appendChild(optAll);

      state.phasesLoaded = true;

      if (!state.currentTournamentId || state.currentTournamentId === 'all') {
        state.currentTournamentId = 4;
      }
      els.tournamentPhaseSelect.value = state.currentTournamentId;
    }
  } catch (err) {
    console.error('Error al obtener fases de torneo:', err);
  }
}

async function renderEstadisticas() {
  if (!els.statsStandingsTbody) return;

  await loadTournamentPhases();

  els.statsStandingsTbody.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-600 italic">Cargando posiciones...</td></tr>';
  if (els.statsZoneATbody) els.statsZoneATbody.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-600 italic">Cargando...</td></tr>';
  if (els.statsZoneBTbody) els.statsZoneBTbody.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-gray-600 italic">Cargando...</td></tr>';
  els.statsScorersTbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-gray-600 italic">Cargando goleadores...</td></tr>';
  els.statsCardsTbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-gray-600 italic">Cargando tarjetas...</td></tr>';
  if (els.statsSuspendedTbody) {
    els.statsSuspendedTbody.innerHTML = '<tr><td colspan="3" class="p-8 text-center text-gray-600 italic">Cargando suspendidos...</td></tr>';
  }

  if (els.statsResultsContainerTbody) {
    els.statsResultsContainerTbody.innerHTML = '<div class="text-center text-gray-600 italic py-8 text-xs animate-pulse">Cargando resultados...</div>';
  }

  try {
    // Populate rounds select if empty
    let currentRound = els.statsResultsRoundSelect ? Number(els.statsResultsRoundSelect.value) : 1;

    if (state.currentTournamentId === 'all') {
      if (els.statsResultsRoundSelect) els.statsResultsRoundSelect.innerHTML = '';
      if (document.getElementById('statsResultsByDateContainer')) {
        document.getElementById('statsResultsByDateContainer').classList.add('hidden');
      }
    } else {
      if (document.getElementById('statsResultsByDateContainer')) {
        document.getElementById('statsResultsByDateContainer').classList.remove('hidden');
      }
      if (els.statsResultsRoundSelect && (els.statsResultsRoundSelect.options.length === 0 || els.statsResultsRoundSelect.dataset.lastTournamentId !== String(state.currentTournamentId))) {
        els.statsResultsRoundSelect.innerHTML = '';
        els.statsResultsRoundSelect.dataset.lastTournamentId = state.currentTournamentId;
        
        let roundsCount = 11;
        if (state.currentTournamentType === 'zonas') {
          roundsCount = 6;
        } else if (state.currentTournamentId === 6 || state.currentTournamentId === 7) {
          roundsCount = 1;
        }

        for (let i = 1; i <= roundsCount; i++) {
          const opt = document.createElement('option');
          opt.value = i;
          if (state.currentTournamentType === 'zonas' && i === 6) {
            opt.textContent = `🏆 Fecha 6 — Final Torneo Corto`;
          } else if (state.currentTournamentId === 6 || state.currentTournamentId === 7) {
            opt.textContent = `🏆 Gran Final`;
          } else {
            opt.textContent = `Fecha ${i}`;
          }
          els.statsResultsRoundSelect.appendChild(opt);
        }

        if (state.currentTournamentId !== 6 && state.currentTournamentId !== 7) {
          const optFinal = document.createElement('option');
          optFinal.value = 'final_fase';
          optFinal.textContent = `🏆 Gran Final ${state.selectedPhaseId === '3' ? 'Clausura' : 'Apertura'}`;
          els.statsResultsRoundSelect.appendChild(optFinal);
        }

        try {
          const resList = await fetch(`/api/stats/current-round?tournamentId=${state.currentTournamentId}`);
          const dataRound = await resList.json();
          currentRound = dataRound.currentRound || 1;
        } catch (e) {
          currentRound = 1;
        }
        els.statsResultsRoundSelect.value = currentRound;
      }

      // Keep it up to date in case it changed inside the if block or was not empty
      currentRound = els.statsResultsRoundSelect ? els.statsResultsRoundSelect.value : currentRound;

      renderResultsByDate(currentRound);
    }

    const simulateDeduction = els.statsSimulateDeduction && els.statsSimulateDeduction.checked;
    const tId = state.currentTournamentId;
    const statsQuery = (tId === 'all' || !tId)
      ? (state.selectedPhaseId === 'all' ? 'phaseId=all' : `phaseId=${state.selectedPhaseId || '1'}`)
      : `tournamentId=${tId}`;

    // Parallel API requests filtering by selected tournamentId/phaseId
    const [scorersRes, cardsRes, suspendedRes] = await Promise.all([
      fetch(`/api/stats/scorers?${statsQuery}`),
      fetch(`/api/stats/cards?${statsQuery}`),
      fetch(`/api/stats/suspended?${statsQuery}`)
    ]);

    const scorers = await scorersRes.json();
    const cards = await cardsRes.json();
    const suspended = await suspendedRes.json();

    // Render Standings dynamically based on tournament type
    if (state.currentTournamentId === 6 || state.currentTournamentId === 7) {
      if (els.statsZonesContainer) els.statsZonesContainer.classList.add('hidden');
      if (els.statsStandingsContainer) {
        els.statsStandingsContainer.classList.remove('hidden');
        const isApertura = state.currentTournamentId === 6;
        els.statsStandingsContainer.innerHTML = `
          <div class="bg-surface-850 rounded-2xl border border-white/5 p-6 mb-6">
            <div class="flex items-center gap-3 pb-4 border-b border-white/5">
              <span class="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xl">🏆</span>
              <div>
                <h3 class="text-sm font-extrabold text-white uppercase tracking-wider">Gran Final del ${isApertura ? 'Apertura 2026' : 'Clausura 2026'}</h3>
                <p class="text-xs text-amber-400 font-semibold">Ganador Torneo Largo vs. Ganador Torneo Corto</p>
              </div>
            </div>
            ${isApertura ? `
              <div class="my-6 p-6 rounded-2xl bg-gradient-to-r from-amber-500/10 via-surface-900 to-amber-500/10 border border-amber-500/20 text-center shadow-2xl animate-fade-up">
                <span class="text-xs font-black uppercase tracking-widest text-amber-400 block mb-2">🎉 CAMPEÓN APERTURA 2026 🎉</span>
                <div class="flex items-center justify-center gap-3 my-2">
                  <img src="/logos-equipos/orden-maderas.png" class="w-12 h-12 object-contain" />
                  <span class="text-2xl font-black text-white tracking-wider">ORDEN MADERAS</span>
                </div>
                <span class="text-xs text-gray-400 font-medium block mt-2">Resultado: Orden Maderas 2 - 0 Pollo Mío</span>
              </div>
            ` : `
              <div class="my-6 p-6 rounded-2xl bg-surface-900/50 border border-white/5 text-center">
                <span class="text-xs font-bold text-gray-400 uppercase tracking-widest">Encuentro programado al concluir ambas competencias del Clausura</span>
              </div>
            `}
          </div>
        `;
      }
    } else if (state.currentTournamentId === 'all') {
      if (els.statsStandingsContainer) els.statsStandingsContainer.classList.add('hidden');
      if (els.statsZonesContainer) els.statsZonesContainer.classList.add('hidden');
    } else if (state.currentTournamentType === 'zonas') {
      if (els.statsStandingsContainer) els.statsStandingsContainer.classList.add('hidden');
      if (els.statsZonesContainer) els.statsZonesContainer.classList.remove('hidden');

      // Fetch groups standings
      const [standingsResA, standingsResB] = await Promise.all([
        fetch(`/api/stats/standings?tournamentId=${state.currentTournamentId}&group=A`),
        fetch(`/api/stats/standings?tournamentId=${state.currentTournamentId}&group=B`)
      ]);
      const standingsA = await standingsResA.json();
      const standingsB = await standingsResB.json();

      const renderTable = (data, tbody) => {
        tbody.innerHTML = data.map((s, idx) => `
          <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
            <td class="py-3 px-4 font-bold text-gray-600 group-hover:text-gray-400 transition-colors text-xs">${idx + 1}</td>
            <td class="py-3 px-4">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center p-1.5 shadow-inner">
                   ${s.shieldUrl ? `<img src="${escapeAttr(s.shieldUrl)}" class="w-full h-full object-contain" />` : '<span class="text-[10px] text-gray-700">?</span>'}
                </div>
                <span class="font-bold text-gray-200 text-sm flex items-center gap-1">
                  ${escapeHTML(s.name)}
                </span>
              </div>
            </td>
            <td class="py-3 px-4 text-gray-400 font-medium">${s.played}</td>
            <td class="py-3 px-4 font-bold" style="color: #10b981 !important;">${s.won}</td>
            <td class="py-3 px-4 font-bold" style="color: #f59e0b !important;">${s.draw}</td>
            <td class="py-3 px-4 font-bold" style="color: #ef4444 !important;">${s.lost}</td>
            <td class="py-3 px-4 font-bold" style="color: #10b981 !important;">${s.goalsFor}</td>
            <td class="py-3 px-4 font-bold" style="color: #ef4444 !important;">${s.goalsAgainst}</td>
            <td class="py-3 px-4 font-mono font-bold" style="color: ${s.goalDiff >= 0 ? '#10b981 !important' : '#ef4444 !important'};">${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</td>
            <td class="py-3 px-4 font-black text-white text-base bg-white/5 border-l border-white/5">${s.points}</td>
          </tr>
        `).join('') || '<tr><td colspan="10" class="p-8 text-center text-gray-600 italic">No hay datos suficientes</td></tr>';
      };

      if (els.statsZoneATbody) renderTable(standingsA, els.statsZoneATbody);
      if (els.statsZoneBTbody) renderTable(standingsB, els.statsZoneBTbody);

    } else {
      if (els.statsZonesContainer) els.statsZonesContainer.classList.add('hidden');
      if (els.statsStandingsContainer) els.statsStandingsContainer.classList.remove('hidden');

      const standingsUrl = simulateDeduction ? `/api/stats/standings?tournamentId=${state.currentTournamentId}&simulateDeduction=true` : `/api/stats/standings?tournamentId=${state.currentTournamentId}`;
      const standingsRes = await fetch(standingsUrl);
      const standings = await standingsRes.json();

      els.statsStandingsTbody.innerHTML = standings.map((s, idx) => `
        <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
          <td class="py-3 px-4 font-bold text-gray-600 group-hover:text-gray-400 transition-colors text-xs">${idx + 1}</td>
          <td class="py-3 px-4">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center p-1.5 shadow-inner">
                 ${s.shieldUrl ? `<img src="${escapeAttr(s.shieldUrl)}" class="w-full h-full object-contain" />` : '<span class="text-[10px] text-gray-700">?</span>'}
              </div>
              <span class="font-bold text-gray-200 text-sm flex items-center gap-1">
                ${escapeHTML(s.name)}
                ${idx === 0 
                  ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-sm ml-1 select-none" title="Campeón">C</span>` 
                  : ''
                }
                ${s.pointsDeduction
                  ? `<span class="text-red-500 font-extrabold text-sm select-none" title="Equipos con sanción pendiente de cumplimiento, quedando sujetos a la quita de los puntos obtenidos entre la Fecha 1 y la Fecha 9 inclusive, conforme al reglamento vigente.">*</span>`
                  : ''
                }
              </span>
            </div>
          </td>
          <td class="py-3 px-4 text-gray-400 font-medium">${s.played}</td>
          <td class="py-3 px-4 font-bold" style="color: #10b981 !important;">${s.won}</td>
          <td class="py-3 px-4 font-bold" style="color: #f59e0b !important;">${s.draw}</td>
          <td class="py-3 px-4 font-bold" style="color: #ef4444 !important;">${s.lost}</td>
          <td class="py-3 px-4 font-bold" style="color: #10b981 !important;">${s.goalsFor}</td>
          <td class="py-3 px-4 font-bold" style="color: #ef4444 !important;">${s.goalsAgainst}</td>
          <td class="py-3 px-4 font-mono font-bold" style="color: ${s.goalDiff >= 0 ? '#10b981 !important' : '#ef4444 !important'};">${s.goalDiff > 0 ? '+' : ''}${s.goalDiff}</td>
          <td class="py-3 px-4 font-black text-white text-base bg-white/5 border-l border-white/5">${s.points}</td>
        </tr>
      `).join('') || '<tr><td colspan="10" class="p-8 text-center text-gray-600 italic">No hay datos suficientes</td></tr>';
    }

    // Render Scorers
    els.statsScorersTbody.innerHTML = scorers.map((s, idx) => `
      <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group">
        <td class="py-3 px-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-8 h-8 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center p-1.5 shadow-inner">
                 ${s.shieldUrl ? `<img src="${escapeAttr(s.shieldUrl)}" class="w-full h-full object-contain" />` : '<span class="text-[10px] text-gray-700">?</span>'}
              </div>
              <div class="flex flex-col">
                <span class="font-bold text-gray-200">${escapeHTML(s.playerName)}</span>
                <span class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">${escapeHTML(s.teamName)}</span>
              </div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 text-right font-black text-xl bg-amber-400/5 group-hover:bg-amber-400/10 transition-colors text-amber-400 px-6">${s.goals}</td>
      </tr>
    `).join('') || '<tr><td colspan="2" class="p-8 text-center text-gray-600">No hay goles registrados</td></tr>';

    // Render Cards
    els.statsCardsTbody.innerHTML = cards.map(c => `
      <tr class="hover:bg-white/5 transition-colors border-b border-white/5 group cursor-pointer" onclick="showPlayerHistory(${c.id}, '${escapeAttr(c.playerName)}', '${escapeAttr(c.teamName)}', '${escapeAttr(c.shieldUrl || '')}')">
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center p-1.5 shadow-inner">
               ${c.shieldUrl ? `<img src="${escapeAttr(c.shieldUrl)}" class="w-full h-full object-contain" />` : '<span class="text-[10px] text-gray-700">?</span>'}
            </div>
            <div class="flex flex-col">
              <span class="font-bold text-gray-200 text-sm">${escapeHTML(c.playerName)}</span>
              <span class="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">${escapeHTML(c.teamName)}</span>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center">
            <span class="inline-flex items-center justify-center w-5 h-7 bg-amber-400 rounded-sm font-bold text-amber-950 text-xs shadow-lg shadow-amber-400/20 mb-1">${c.yellowCards}</span>
          </div>
        </td>
        <td class="py-3 px-4 text-center">
          <div class="inline-flex flex-col items-center">
            <span class="inline-flex items-center justify-center w-5 h-7 bg-red-600 rounded-sm font-bold text-white text-xs shadow-lg shadow-red-600/20 mb-1" title="${c.suspensionMatches ? c.suspensionMatches + ' fechas de suspensión' : 'Roja'}">${c.redCards}</span>
            ${c.suspensionMatches ? `<span class="text-[9px] text-gray-500 font-medium whitespace-nowrap">${c.suspensionMatches} fecha${c.suspensionMatches !== 1 ? 's' : ''}</span>` : ''}
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="p-8 text-center text-gray-600">Sin sanciones registradas</td></tr>';

    // Render Suspended
    if (els.statsSuspendedTbody) {
      if (suspended.length === 0) {
        els.statsSuspendedTbody.innerHTML = `<tr><td colspan="3" class="p-8 text-center text-gray-400 font-bold bg-surface-900/30">👍 No hay jugadores suspendidos actualmente.</td></tr>`;
      } else {
        els.statsSuspendedTbody.innerHTML = suspended.map(s => {
          return `
            <tr class="hover:bg-red-500/5 transition-colors border-b border-white/5 group">
              <td class="py-3 px-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-lg bg-surface-900 border border-white/5 flex items-center justify-center p-1.5 shadow-inner">
                     ${s.shieldUrl ? `<img src="${escapeAttr(s.shieldUrl)}" class="w-full h-full object-contain" />` : '<span class="text-[10px] text-gray-700">?</span>'}
                  </div>
                  <div>
                    <div class="font-bold text-gray-200 text-sm group-hover:text-white transition-colors">
                      ${escapeHTML(s.playerName)}
                    </div>
                    <div class="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">${escapeHTML(s.teamName)}</div>
                  </div>
                </div>
              </td>
              <td class="py-3 px-4 text-center">
                <div class="text-[11px] font-bold text-gray-300">${escapeHTML(s.suspensionType || 'Roja Directa')}</div>
                <div class="text-[10px] text-gray-500 uppercase font-semibold mt-0.5">
                  Sanción: ${s.isPending ? `<span class="text-amber-500 animate-pulse">PENDIENTE</span> <span class="text-[9px] text-amber-500/80">(Cumplidas: ${s.servedMatches})</span>` : `${s.originalSuspension} fechas`}
                </div>
                <div class="text-[9px] text-gray-600 mt-1">Dada en Fecha ${s.cardRound}</div>
              </td>
              <td class="py-3 px-4 text-left md:text-center w-36">
                <div class="inline-flex w-full md:w-auto flex-col items-center gap-1.5 p-2 rounded bg-red-500/10 border border-red-500/20 shadow-inner">
                  <div class="flex items-center gap-1.5 text-red-400 font-black text-[10px] uppercase tracking-widest">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.5)]"></span>
                    Suspendido
                  </div>
                  <div class="text-[10px] text-gray-300 font-semibold px-2 py-0.5 bg-black/20 rounded">
                    ${s.isPending ? `<span class="text-amber-400 italic">Cumplidas: <span class="text-white">${s.servedMatches}</span></span>` : `Le quedan: <span class="text-white font-black text-sm">${s.remainingMatches}</span> <span class="text-[8px] text-gray-500">(Cumplidas: ${s.servedMatches})</span>`}
                  </div>
                </div>
                ${s.isPending ? `
                  <button onclick="resolvePendingSuspension(${s.cardId}, '${escapeAttr(s.playerName)}')" class="mt-2 w-full py-1 px-2 bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-bold rounded uppercase transition-colors">
                    Definir
                  </button>
                ` : ''}
              </td>
            </tr>
          `;
        }).join('');
      }
    }

  } catch (err) {
    console.error(err);
    if (els.statsStandingsTbody) els.statsStandingsTbody.innerHTML = '<tr><td colspan="10" class="p-8 text-center text-red-400">Error al cargar estadísticas</td></tr>';
  }
}

function groupGoalsByPlayer(goals) {
  const grouped = {};
  goals.forEach(g => {
    const key = g.playerId;
    if (!grouped[key]) {
      grouped[key] = { ...g, count: 0, minutes: [] };
    }
    grouped[key].count++;
    if (g.minute) grouped[key].minutes.push(g.minute);
  });
  return Object.values(grouped);
}

async function renderResultsByDate(round) {
  if (!els.statsResultsContainerTbody) return;

  try {
    const res = await fetch(`/api/stats/results?round=${round}&tournamentId=${state.currentTournamentId}`);
    const matches = await res.json();

    if (!matches || matches.length === 0) {
      els.statsResultsContainerTbody.innerHTML = '<div class="text-center text-gray-600 italic py-8 text-xs">No hay partidos programados para esta fecha</div>';
      return;
    }

    els.statsResultsContainerTbody.innerHTML = matches.map(m => {
      const homeGoals = groupGoalsByPlayer(m.goals.filter(g => g.teamId === m.homeTeamId));
      const awayGoals = groupGoalsByPlayer(m.goals.filter(g => g.teamId === m.awayTeamId));
      const homeCards = m.cards.filter(c => c.teamId === m.homeTeamId);
      const awayCards = m.cards.filter(c => c.teamId === m.awayTeamId);

      const isPlayed = m.status === 'played';
      const scoreColor = isPlayed ? 'text-white' : 'text-gray-600';

      return `
        <div class="bg-surface-900/40 rounded-xl p-3 border border-white/5 hover:border-pitch-500/20 transition-all group">
          <!-- Score Row -->
          <div class="flex items-center justify-between gap-4 mb-2">
            <div class="flex-1 flex items-center gap-2 justify-end">
              <span class="text-[11px] font-bold text-gray-300 text-right leading-tight">${escapeHTML(m.homeTeamName)}</span>
              <div class="w-6 h-6 rounded bg-surface-850 p-1 flex-shrink-0">
                ${m.homeTeamShield ? `<img src="${escapeAttr(m.homeTeamShield)}" class="w-full h-full object-contain" />` : ''}
              </div>
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1 bg-surface-950 rounded-lg border border-white/5 group-hover:border-pitch-500/30 transition-colors">
              <span class="text-sm font-black ${scoreColor}">${isPlayed ? m.homeScore : '-'}</span>
              <span class="text-[10px] text-gray-700 font-bold">:</span>
              <span class="text-sm font-black ${scoreColor}">${isPlayed ? m.awayScore : '-'}</span>
            </div>
            <div class="flex-1 flex items-center gap-2">
              <div class="w-6 h-6 rounded bg-surface-850 p-1 flex-shrink-0">
                ${m.awayTeamShield ? `<img src="${escapeAttr(m.awayTeamShield)}" class="w-full h-full object-contain" />` : ''}
              </div>
              <span class="text-[11px] font-bold text-gray-300 leading-tight">${escapeHTML(m.awayTeamName)}</span>
            </div>
          </div>

          <!-- Details Row (Goles y Tarjetas) -->
          <div class="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
            <!-- Home Details -->
            <div class="space-y-1">
              ${homeGoals.map(g => `
                <div class="flex items-center gap-1 text-[9px] text-gray-400">
                  <span class="text-pitch-400 font-bold">${g.minutes.length > 0 ? g.minutes.join("', ") + "'" : ''}</span>
                  <span class="">${escapeHTML(g.playerName)} ${g.count > 1 ? `<span class="text-pitch-500 font-black">x${g.count}</span>` : ''}</span>
                  <span>⚽</span>
                </div>
              `).join('')}
              ${homeCards.map(c => `
                <div class="flex items-center gap-1 text-[9px] text-gray-400">
                   <span class="text-gray-500 font-bold">${c.minute ? c.minute + "'" : ''}</span>
                   <span class="">${escapeHTML(c.playerName)}</span>
                   <span>${c.cardType === 'red' ? '🔴' : '🟡'}</span>
                </div>
              `).join('')}
            </div>
            <!-- Away Details -->
            <div class="space-y-1 text-right">
              ${awayGoals.map(g => `
                <div class="flex items-center gap-1 text-[9px] text-gray-400 justify-end">
                  <span>⚽</span>
                  <span class="">${escapeHTML(g.playerName)} ${g.count > 1 ? `<span class="text-pitch-500 font-black">x${g.count}</span>` : ''}</span>
                  <span class="text-pitch-400 font-bold">${g.minutes.length > 0 ? g.minutes.join("', ") + "'" : ''}</span>
                </div>
              `).join('')}
              ${awayCards.map(c => `
                <div class="flex items-center gap-1 text-[9px] text-gray-400 justify-end">
                   <span>${c.cardType === 'red' ? '🔴' : '🟡'}</span>
                   <span class="">${escapeHTML(c.playerName)}</span>
                   <span class="text-gray-500 font-bold">${c.minute ? c.minute + "'" : ''}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    els.statsResultsContainerTbody.innerHTML = '<div class="text-center text-red-400 text-xs py-8">Error al cargar resultados</div>';
  }
}

// Global hook for tab switching
const originalSwitchTab = window.switchTab;
window.switchTab = function (tabId) {
  if (originalSwitchTab) originalSwitchTab(tabId);
  if (tabId === 'estadisticas') {
    renderEstadisticas();
  }
};

// Re-wire specifically for the sidebar buttons
document.querySelectorAll('.sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    if (tabId === 'estadisticas') {
      renderEstadisticas();
    }
  });
});

// HISTORIAL DISCIPLINARIO (MODAL)
async function showPlayerHistory(playerId, playerName, teamName, shieldUrl) {
  // Rellenar cabecera del modal
  els.phPlayerName.textContent = playerName;
  els.phTeamName.textContent = teamName;
  els.phTeamShield.innerHTML = shieldUrl && shieldUrl !== 'undefined'
    ? `<img src="${shieldUrl}" class="w-full h-full object-contain" />`
    : `<span class="text-xs text-gray-700">?</span>`;

  els.phTimelineContainer.innerHTML = '<div class="p-8 text-center text-gray-600 italic">Cargando historial...</div>';
  els.phTotalCards.textContent = '0';

  // Abrir Modal
  els.playerHistoryModal.classList.remove('hidden');

  try {
    const res = await fetch(`/api/stats/player/${playerId}/cards`);
    if (!res.ok) throw new Error('Error al obtener historial');
    const history = await res.json();

    els.phTotalCards.textContent = history.length;

    if (history.length === 0) {
      els.phTimelineContainer.innerHTML = '<div class="p-8 text-center text-gray-500 font-semibold">⚽ No registra tarjetas en la historia.</div>';
      return;
    }

    // Render timeline
    els.phTimelineContainer.innerHTML = history.map((card, index) => {
      const isRed = card.cardType === 'red';
      const bgColor = isRed ? 'bg-red-500/10' : 'bg-yellow-400/10';
      const borderColor = isRed ? 'border-red-500/20' : 'border-yellow-400/20';
      const icon = isRed ? '🔴' : '🟡';

      const parts = [];
      if (card.calendarDate) {
        const d = card.calendarDate.split('-');
        if (d.length === 3) parts.push(`📅 ${d[2]}/${d[1]}/${d[0]}`);
        else parts.push(`📅 ${card.calendarDate}`);
      } else {
        parts.push(`📅 Sin fecha`);
      }
      if (card.minute) parts.push(`⏱️ Min ${card.minute}`);
      const detailsText = parts.join(' • ');

      let suspensionHtml = '';
      if (isRed && card.suspensionMatches) {
        suspensionHtml = `
          <div class="mt-2 text-xs">
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-red-500/10 text-red-400 font-bold tracking-wider">
              <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
               Suspensión de ${card.suspensionMatches} fecha${card.suspensionMatches > 1 ? 's' : ''}
            </span>
          </div>
        `;
      }

      return `
        <div class="flex gap-4 group">
          <div class="flex flex-col items-center">
            <div class="w-10 h-10 rounded shadow-sm border flex items-center justify-center text-lg ${bgColor} ${borderColor}">
              ${icon}
            </div>
            ${index !== history.length - 1 ? '<div class="w-px h-full bg-white/5 my-2 group-hover:bg-white/10 transition-colors"></div>' : ''}
          </div>
          <div class="pb-6">
            <h4 class="text-white font-bold text-sm flex items-center gap-2">
              Fecha ${card.roundNumber} 
              <span class="text-[10px] text-gray-500 uppercase tracking-widest font-normal bg-white/5 px-2 py-0.5 rounded">${escapeHTML(card.tournamentLabel)} • ${escapeHTML(card.phaseLabel)}</span>
            </h4>
            <p class="text-xs text-gray-400 mt-1">${detailsText}</p>
            ${suspensionHtml}
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error(err);
    els.phTimelineContainer.innerHTML = '<div class="p-8 text-center text-red-400">Error al cargar historial</div>';
  }
}

window.resolvePendingSuspension = async function(cardId, playerName) {
  const matchesStr = prompt(`Definir cantidad de fechas de suspensión para ${playerName}:`, "1");
  if (matchesStr === null) return;
  
  const matches = parseInt(matchesStr, 10);
  if (isNaN(matches) || matches < 0) {
    showToast('Cantidad de fechas inválida', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/fixture/cards/${cardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        suspensionMatches: matches,
        isPending: false
      })
    });

    if (res.ok) {
      showToast(`Sanción de ${playerName} definida: ${matches} fechas`, 'success');
      renderEstadisticas();
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al actualizar sanción', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Error de conexión', 'error');
  }
};

/* ── HISTORIAL SUB-TABS & CHARTS ── */
function switchHistorialSubtab(subtab) {
  state.currentHistorialSubtab = subtab;
  
  const subtabList = document.getElementById('historial-subtab-list');
  const subtabChart = document.getElementById('historial-subtab-chart');
  const listView = document.getElementById('historial-list-view');
  const chartView = document.getElementById('historial-chart-view');
  
  if (subtabList && subtabChart && listView && chartView) {
    if (subtab === 'list') {
      subtabList.classList.add('active');
      subtabChart.classList.remove('active');
      listView.classList.remove('hidden');
      chartView.classList.add('hidden');
    } else {
      subtabList.classList.remove('active');
      subtabChart.classList.add('active');
      listView.classList.add('hidden');
      chartView.classList.remove('hidden');
      switchChartMode(state.currentChartMode || 'paid');
    }
  }
}

function switchChartMode(mode) {
  state.currentChartMode = mode;
  
  const togglePaid = document.getElementById('chart-toggle-paid');
  const togglePending = document.getElementById('chart-toggle-pending');
  
  if (togglePaid && togglePending) {
    if (mode === 'paid') {
      togglePaid.className = "px-4 py-1.5 rounded-lg text-xs font-bold bg-pitch-500/10 text-pitch-400 border border-pitch-500/20 transition-all";
      togglePending.className = "px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition-all";
    } else {
      togglePending.className = "px-4 py-1.5 rounded-lg text-xs font-bold bg-pitch-500/10 text-pitch-400 border border-pitch-500/20 transition-all";
      togglePaid.className = "px-4 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white transition-all";
    }
  }
  
  renderCategoryChart();
}

function renderCategoryChart() {
  const chartView = document.getElementById('historial-chart-view');
  if (!chartView || chartView.classList.contains('hidden')) return;

  const donutSvg = document.getElementById('categoriesDonutSvg');
  const listContainer = document.getElementById('categoriesChartList');
  const totalBadge = document.getElementById('chartTotalExpenseBadge');
  const centerAmount = document.getElementById('donutCenterAmount');
  const centerPercent = document.getElementById('donutCenterPercent');
  const centerLabel = document.getElementById('donutCenterLabel');

  if (!donutSvg || !listContainer) return;

  // Actualizar indicadores adicionales (Dinero Disponible y Dinero por Cobrar)
  const chartAvailableMoney = els.chartAvailableMoney;
  const chartPendingCollection = els.chartPendingCollection;
  
  if (chartAvailableMoney) {
    const balance = state.summary?.balanceCents || 0;
    chartAvailableMoney.textContent = formatMoney(balance);
    chartAvailableMoney.className = `text-xs font-extrabold ${balance < 0 ? 'text-red-400' : 'text-emerald-400'}`;
  }
  if (chartPendingCollection) {
    const pending = state.summary?.tournament?.pendingCollectionCents || 0;
    chartPendingCollection.textContent = formatMoney(pending);
  }

  // Calcular dinero por pagar globalmente (Arbitraje y Cancha restantes)
  const chartPendingPayments = els.chartPendingPayments;
  if (chartPendingPayments) {
    const globalExpenses = state.movements.filter(m => m.type === 'expense');
    const globalGroups = {};
    globalExpenses.forEach(m => {
      const category = m.category || 'Sin categoría';
      const amount = m.amountCents || m.amount || 0;
      globalGroups[category] = (globalGroups[category] || 0) + amount;
    });

    const totalRoundsVal = 18;
    const rules = {
      'Arbitraje': 370000 * 100,
      'Alquiler de cancha': 260000 * 100,
    };
    let pendingPaymentsTotal = 0;
    Object.keys(rules).forEach(catName => {
      const costPerRound = rules[catName];
      const budgetCents = totalRoundsVal * costPerRound;
      const paidCents = globalGroups[catName] || 0;
      const pendingCents = Math.max(0, budgetCents - paidCents);
      pendingPaymentsTotal += pendingCents;
    });
    chartPendingPayments.textContent = formatMoney(pendingPaymentsTotal);
  }

  const expenses = state.movements.filter(m => {
    if (m.type !== 'expense') return false;
    if (state.currentTeamFilter !== 'all') {
      const teamId = Number(state.currentTeamFilter);
      return Number(m.teamId || 0) === teamId;
    }
    return true;
  });

  const groups = {};
  expenses.forEach(m => {
    const category = m.category || 'Sin categoría';
    const amount = m.amountCents || m.amount || 0;
    if (!groups[category]) {
      groups[category] = 0;
    }
    groups[category] += amount;
  });

  const isPendingMode = state.currentChartMode === 'pending';
  const totalRounds = 18;
  const categoryRules = {
    'Arbitraje': 370000 * 100,
    'Alquiler de cancha': 260000 * 100,
  };

  let categories = [];
  let totalCents = 0;

  if (isPendingMode) {
    Object.keys(categoryRules).forEach(catName => {
      const costPerRound = categoryRules[catName];
      const budgetCents = totalRounds * costPerRound;
      const paidCents = groups[catName] || 0;
      const pendingCents = Math.max(0, budgetCents - paidCents);
      
      const paidRounds = Math.min(totalRounds, Math.round(paidCents / costPerRound));
      const paidPercent = budgetCents > 0 ? (paidCents / budgetCents) * 100 : 0;
      
      if (pendingCents > 0) {
        categories.push({
          name: catName,
          amountCents: pendingCents,
          paidCents: paidCents,
          budgetCents: budgetCents,
          paidRounds: paidRounds,
          totalRounds: totalRounds,
          paidPercent: paidPercent,
        });
        totalCents += pendingCents;
      }
    });

    if (centerLabel) centerLabel.textContent = 'Falta Pagar';
    if (totalBadge) {
      totalBadge.className = 'text-xs font-bold text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-full border border-orange-500/20';
    }
  } else {
    Object.keys(groups).forEach(catName => {
      const amountCents = groups[catName];
      categories.push({
        name: catName,
        amountCents: amountCents,
      });
      totalCents += amountCents;
    });

    if (centerLabel) centerLabel.textContent = 'Total Pagado';
    if (totalBadge) {
      totalBadge.className = 'text-xs font-bold text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-full border border-red-500/20';
    }
  }

  categories.forEach(cat => {
    cat.percent = totalCents > 0 ? (cat.amountCents / totalCents) * 100 : 0;
  });

  categories.sort((a, b) => b.amountCents - a.amountCents);

  if (totalBadge) totalBadge.textContent = formatMoney(totalCents);

  const resetCenterText = () => {
    if (centerLabel) centerLabel.textContent = isPendingMode ? 'Falta Pagar' : 'Total Pagado';
    if (centerAmount) centerAmount.textContent = formatMoney(totalCents);
    if (centerPercent) centerPercent.textContent = '';
  };
  resetCenterText();

  if (totalCents === 0) {
    donutSvg.innerHTML = `
      <circle cx="60" cy="60" r="45" fill="none" stroke="#2a2e37" stroke-width="12" />
      <circle cx="60" cy="60" r="39" fill="#161920" class="pointer-events-none" />
    `;
    listContainer.innerHTML = `<div class="text-center text-gray-600 py-8 text-xs italic">${isPendingMode ? 'No quedan egresos pendientes por pagar.' : 'No hay egresos registrados para este filtro.'}</div>`;
    return;
  }

  const categoryColors = {
    'Arbitraje': '#10b981',
    'Alquiler de cancha': '#06b6d4',
    'Premio': '#8b5cf6',
    'Material deportivo': '#ec4899',
    'Gastos administrativos': '#f59e0b',
  };

  const palette = ['#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#6366f1', '#ef4444', '#eab308', '#84cc16'];
  const getCategoryColor = (name, index) => categoryColors[name] || palette[index % palette.length];

  categories.forEach((cat, index) => {
    cat.color = getCategoryColor(cat.name, index);
  });

  const radius = 45;
  const strokeWidth = 12;
  const circ = 2 * Math.PI * radius;
  
  let currentAngle = 0;
  let donutHtml = '';

  categories.forEach((cat, index) => {
    const percent = cat.percent;
    const strokeDasharray = circ;
    const strokeDashoffset = circ - (percent / 100) * circ;
    const rotation = currentAngle - 90;
    
    donutHtml += `
      <circle cx="60" cy="60" r="${radius}"
        fill="none" stroke="${cat.color}" stroke-width="${strokeWidth}"
        stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"
        transform="rotate(${rotation} 60 60)"
        style="--hover-color: ${cat.color}; opacity: 0.85;"
        data-index="${index}" class="transition-all duration-300"
      />
    `;
    currentAngle += (percent / 100) * 360;
  });

  donutHtml += `<circle cx="60" cy="60" r="${radius - strokeWidth/2 - 2}" fill="#161920" class="pointer-events-none" />`;
  donutSvg.innerHTML = donutHtml;

  listContainer.innerHTML = categories.map((cat, index) => {
    if (isPendingMode) {
      return `
        <div class="category-chart-row p-2.5 rounded-xl border border-white/0 hover:border-white/5 flex flex-col gap-1.5 cursor-pointer transition-all" data-index="${index}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${cat.color}"></span>
              <span class="text-xs font-semibold text-gray-200 truncate">${escapeHTML(cat.name)}</span>
              <span class="text-[10px] text-gray-500 font-normal">(${cat.paidRounds} de ${cat.totalRounds} fechas pagadas)</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-xs font-extrabold text-orange-400">Falta: ${escapeHTML(formatMoney(cat.amountCents))}</span>
              <span class="text-[10px] font-bold text-gray-400 bg-surface-800 px-1.5 py-0.5 rounded border border-white/5">${cat.percent.toFixed(1)}%</span>
            </div>
          </div>
          <div class="flex justify-between items-center text-[10px] text-gray-500">
            <span>Pagado: ${escapeHTML(formatMoney(cat.paidCents))}</span>
            <span>${cat.paidPercent.toFixed(0)}%</span>
          </div>
          <div class="w-full bg-surface-900 rounded-full h-1.5 overflow-hidden">
            <div class="h-1.5 rounded-full transition-all duration-500" style="width: ${cat.paidPercent}%; background-color: #10b981;"></div>
          </div>
        </div>
      `;
    } else {
      const count = expenses.filter(m => (m.category || 'Sin categoría') === cat.name).length;
      return `
        <div class="category-chart-row p-2.5 rounded-xl border border-white/0 hover:border-white/5 flex flex-col gap-1.5 cursor-pointer transition-all" data-index="${index}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 min-w-0">
              <span class="w-3 h-3 rounded-full flex-shrink-0" style="background-color: ${cat.color}"></span>
              <span class="text-xs font-semibold text-gray-200 truncate">${escapeHTML(cat.name)}</span>
              <span class="text-[10px] text-gray-500 font-normal">(${count})</span>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <span class="text-xs font-extrabold text-white">${escapeHTML(formatMoney(cat.amountCents))}</span>
              <span class="text-[10px] font-bold text-gray-400 bg-surface-800 px-1.5 py-0.5 rounded border border-white/5">${cat.percent.toFixed(1)}%</span>
            </div>
          </div>
          <div class="w-full bg-surface-900 rounded-full h-1.5 overflow-hidden">
            <div class="h-1.5 rounded-full transition-all duration-500" style="width: ${cat.percent}%; background-color: ${cat.color}"></div>
          </div>
        </div>
      `;
    }
  }).join('');

  const slices = donutSvg.querySelectorAll('circle[data-index]');
  const rows = listContainer.querySelectorAll('.category-chart-row');

  const highlight = (index) => {
    slices.forEach(slice => {
      if (slice.getAttribute('data-index') === String(index)) {
        slice.style.opacity = '1';
        slice.setAttribute('stroke-width', String(strokeWidth + 3));
      } else {
        slice.style.opacity = '0.3';
        slice.setAttribute('stroke-width', String(strokeWidth));
      }
    });

    rows.forEach(row => {
      if (row.getAttribute('data-index') === String(index)) {
        row.classList.add('bg-white/5', 'border-white/10');
      } else {
        row.classList.remove('bg-white/5', 'border-white/10');
      }
    });

    // Update center label
    const cat = categories[index];
    if (cat) {
      if (centerLabel) centerLabel.textContent = cat.name;
      if (centerAmount) centerAmount.textContent = formatMoney(cat.amountCents);
      if (centerPercent) centerPercent.textContent = isPendingMode ? `${cat.percent.toFixed(1)}% del faltante` : `${cat.percent.toFixed(1)}% del total`;
    }
  };

  const clearHighlight = () => {
    slices.forEach(slice => {
      slice.style.opacity = '0.85';
      slice.setAttribute('stroke-width', String(strokeWidth));
    });
    rows.forEach(row => {
      row.classList.remove('bg-white/5', 'border-white/10');
    });
    resetCenterText();
  };

  slices.forEach(slice => {
    const idx = slice.getAttribute('data-index');
    slice.addEventListener('mouseenter', () => highlight(idx));
    slice.addEventListener('mouseleave', clearHighlight);
  });

  rows.forEach(row => {
    const idx = row.getAttribute('data-index');
    row.addEventListener('mouseenter', () => highlight(idx));
    row.addEventListener('mouseleave', clearHighlight);
  });

  // ── GENERATE PROJECTED FINANCIAL SUMMARY ──
  // Group all global expenses (Egresos Realizados)
  const globalExpenses = state.movements.filter(m => m.type === 'expense');
  const paidGroups = {};
  let totalPaidCents = 0;
  globalExpenses.forEach(m => {
    const category = m.category || 'Sin categoría';
    const amount = m.amountCents || m.amount || 0;
    paidGroups[category] = (paidGroups[category] || 0) + amount;
    totalPaidCents += amount;
  });

  // Calculate Pagos Pendientes (Arbitraje and Cancha)
  const totalRoundsVal = 18;
  const rules = {
    'Arbitraje': 370000 * 100,
    'Alquiler de cancha': 260000 * 100,
  };
  
  const pendingGroups = {};
  let totalPendingCents = 0;
  Object.keys(rules).forEach(catName => {
    const costPerRound = rules[catName];
    const budgetCents = totalRoundsVal * costPerRound;
    const paidCents = paidGroups[catName] || 0;
    const pendingCents = Math.max(0, budgetCents - paidCents);
    pendingGroups[catName] = pendingCents;
    totalPendingCents += pendingCents;
  });

  // Populate summaryPaidList
  const summaryPaidList = els.summaryPaidList;
  if (els.summaryPaidTotal) {
    els.summaryPaidTotal.textContent = formatMoney(totalPaidCents);
  }
  if (summaryPaidList) {
    const sortedPaid = Object.keys(paidGroups).map(name => ({
      name,
      amountCents: paidGroups[name],
      percent: totalPaidCents > 0 ? (paidGroups[name] / totalPaidCents) * 100 : 0
    })).sort((a, b) => b.amountCents - a.amountCents);

    if (sortedPaid.length === 0) {
      summaryPaidList.innerHTML = '<div class="text-xs text-gray-500 italic p-4 text-center bg-surface-900/10 rounded-xl border border-white/5">No hay egresos registrados.</div>';
    } else {
      const categoryColors = {
        'Arbitraje': '#10b981',
        'Alquiler de cancha': '#06b6d4',
        'Premio': '#8b5cf6',
        'Material deportivo': '#ec4899',
        'Gastos administrativos': '#f59e0b',
      };
      const palette = ['#3b82f6', '#a855f7', '#f97316', '#14b8a6', '#6366f1', '#ef4444', '#eab308', '#84cc16'];
      const getCol = (n, idx) => categoryColors[n] || palette[idx % palette.length];

      summaryPaidList.innerHTML = sortedPaid.map((item, idx) => {
        const color = getCol(item.name, idx);
        let roundsText = '';
        if (rules[item.name]) {
          const costPerRound = rules[item.name];
          const paidRounds = Math.min(totalRoundsVal, Math.round(item.amountCents / costPerRound));
          roundsText = ` <span class="text-[10px] text-gray-500 font-normal">(${paidRounds} fechas)</span>`;
        }

        return `
          <div class="flex flex-col gap-1">
            <div class="flex justify-between items-center text-xs">
              <span class="text-gray-300 font-medium flex items-center gap-1.5 truncate pr-2">
                <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
                ${escapeHTML(item.name)}${roundsText}
              </span>
              <span class="text-gray-100 font-bold flex-shrink-0">${escapeHTML(formatMoney(item.amountCents))}</span>
            </div>
            <div class="w-full bg-surface-900 rounded-full h-1 overflow-hidden">
              <div class="h-1 rounded-full" style="width: ${item.percent}%; background-color: ${color}"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Populate summaryPendingList
  const summaryPendingList = els.summaryPendingList;
  if (els.summaryPendingTotal) {
    els.summaryPendingTotal.textContent = formatMoney(totalPendingCents);
  }
  if (summaryPendingList) {
    const sortedPending = Object.keys(pendingGroups).map(name => {
      const costPerRound = rules[name];
      const paidCents = paidGroups[name] || 0;
      const paidRounds = Math.min(totalRoundsVal, Math.round(paidCents / costPerRound));
      const pendingRounds = Math.max(0, totalRoundsVal - paidRounds);
      
      return {
        name,
        amountCents: pendingGroups[name],
        pendingRounds,
        percent: totalPendingCents > 0 ? (pendingGroups[name] / totalPendingCents) * 100 : 0
      };
    }).filter(item => item.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);

    if (sortedPending.length === 0) {
      summaryPendingList.innerHTML = '<div class="text-xs text-gray-500 italic p-4 text-center bg-surface-900/10 rounded-xl border border-white/5">No hay egresos pendientes por pagar.</div>';
    } else {
      const pendingColors = {
        'Arbitraje': '#10b981',
        'Alquiler de cancha': '#06b6d4'
      };
      summaryPendingList.innerHTML = sortedPending.map(item => {
        const color = pendingColors[item.name] || '#6b7280';
        return `
          <div class="flex flex-col gap-1">
            <div class="flex justify-between items-center text-xs">
              <span class="text-gray-300 font-medium flex items-center gap-1.5 truncate pr-2">
                <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background-color: ${color}"></span>
                ${escapeHTML(item.name)}
                <span class="text-[10px] text-gray-500 font-normal">(${item.pendingRounds} fechas)</span>
              </span>
              <span class="text-orange-400 font-bold flex-shrink-0">${escapeHTML(formatMoney(item.amountCents))}</span>
            </div>
            <div class="w-full bg-surface-900 rounded-full h-1 overflow-hidden">
              <div class="h-1 rounded-full" style="width: ${item.percent}%; background-color: ${color}"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Populate summaryGeneralStats
  const summaryGeneralStats = els.summaryGeneralStats;
  if (summaryGeneralStats) {
    const budgetCents = state.summary?.tournament?.budgetCents || 0;
    const costTournamentCents = totalPaidCents + totalPendingCents;
    const balanceCents = budgetCents - costTournamentCents;
    
    const costPercent = budgetCents > 0 ? Math.min(100, (costTournamentCents / budgetCents) * 100) : 0;
    const balancePercent = budgetCents > 0 ? Math.max(0, (balanceCents / budgetCents) * 100) : 0;
    const isDeficit = balanceCents < 0;

    summaryGeneralStats.innerHTML = `
      <div class="flex flex-col gap-1.5">
        <div class="flex justify-between items-center text-xs">
          <span class="text-gray-400 font-medium">Presupuesto Total (Ingresos)</span>
          <span class="text-white font-extrabold">${escapeHTML(formatMoney(budgetCents))}</span>
        </div>
        <div class="w-full bg-surface-900 rounded-full h-1 overflow-hidden">
          <div class="h-1 rounded-full bg-blue-500" style="width: 100%"></div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <div class="flex justify-between items-center text-xs">
          <span class="text-gray-400 font-medium">Costo Total Proyectado</span>
          <span class="text-white font-extrabold">${escapeHTML(formatMoney(costTournamentCents))}</span>
        </div>
        <div class="flex justify-between text-[9px] text-gray-500 -mt-1">
          <span>(Pagado + Pendiente)</span>
          <span>${costPercent.toFixed(1)}% del presupuesto</span>
        </div>
        <div class="w-full bg-surface-900 rounded-full h-1 overflow-hidden">
          <div class="h-1 rounded-full bg-orange-500" style="width: ${costPercent}%"></div>
        </div>
      </div>

      <div class="flex flex-col gap-1.5 pt-1.5 border-t border-white/5">
        <div class="flex justify-between items-center text-xs">
          <span class="${isDeficit ? 'text-red-400' : 'text-emerald-400'} font-bold">${isDeficit ? 'Déficit Proyectado' : 'Sobrante Estimado'}</span>
          <span class="${isDeficit ? 'text-red-400' : 'text-emerald-400'} font-black text-sm">${escapeHTML(formatMoney(Math.abs(balanceCents)))}</span>
        </div>
        ${!isDeficit ? `
          <div class="w-full bg-surface-900 rounded-full h-1 overflow-hidden">
            <div class="h-1 rounded-full bg-emerald-500" style="width: ${balancePercent}%"></div>
          </div>
        ` : `
          <div class="text-[9px] text-red-500 italic mt-0.5">El costo proyectado supera el presupuesto total esperado por ${escapeHTML(formatMoney(Math.abs(balanceCents)))}.</div>
        `}
      </div>
    `;
  }
}

function exportFixturePdf() {
  const tournamentName = document.getElementById('tournamentName')?.textContent.trim() || 'Torneo';
  
  // Find active phase name
  const activePhaseBtn = document.querySelector('#fixturePhaseBadges .phase-badge.active');
  const phaseName = activePhaseBtn ? activePhaseBtn.textContent.trim() : '';

  // Find active sub-tab name (Todos vs Todos or Zonas A y B)
  const activeSubBtn = document.querySelector('#fixtureSubNav .fixture-sub-btn.active');
  const subName = activeSubBtn ? activeSubBtn.textContent.trim() : '';

  // Get and clone fixtureContent
  const fixtureContentEl = document.getElementById('fixtureContent');
  if (!fixtureContentEl) return;

  const clone = fixtureContentEl.cloneNode(true);

  // Remove standings tables and other no-print elements from the clone
  clone.querySelectorAll('.no-print').forEach(el => el.remove());

  // Replace section elements with div elements in the clone to avoid being hidden by general section styles in print mode
  clone.querySelectorAll('section').forEach(sec => {
    const div = document.createElement('div');
    for (let attr of sec.attributes) {
      div.setAttribute(attr.name, attr.value);
    }
    div.innerHTML = sec.innerHTML;
    sec.parentNode.replaceChild(div, sec);
  });

  // Also remove edit/interactive controls from match cards inside the clone
  clone.querySelectorAll('.goals-toggle-btn, .cards-toggle-btn, .goals-panel, .cards-panel, .goals-input, button, input').forEach(el => el.remove());

  // Inject into print container
  let container = document.getElementById('fixture-print-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'fixture-print-container';
    container.className = 'print-only-fixture-container';
    document.body.appendChild(container);
  }

  // Set the clean print layout HTML
  container.innerHTML = `
    <div class="print-header-fixture text-center mb-8 border-b-2 border-emerald-500 pb-4">
      <h1 class="text-2xl font-black uppercase tracking-widest text-white">Fixture Oficial</h1>
      <p class="text-xs text-emerald-400 font-bold uppercase tracking-wider mt-1">${tournamentName} — ${phaseName} — ${subName}</p>
    </div>
    <div class="print-body-fixture">
      ${clone.innerHTML}
    </div>
  `;

  // Set page title for PDF filename
  const originalTitle = document.title;
  const cleanTournament = tournamentName.replace(/[^a-z0-9]/gi, '-');
  const cleanPhase = phaseName.replace(/[^a-z0-9]/gi, '-');
  const cleanSub = subName.replace(/[^a-z0-9]/gi, '-');
  const today = new Date().toISOString().split('T')[0];
  document.title = `Fixture-${cleanTournament}-${cleanPhase}-${cleanSub}-${today}`;

  // Add print class and trigger print
  document.body.classList.add('is-printing-fixture');

  setTimeout(() => {
    window.print();
    document.body.classList.remove('is-printing-fixture');
    container.innerHTML = '';
    document.title = originalTitle;
  }, 150);
}
