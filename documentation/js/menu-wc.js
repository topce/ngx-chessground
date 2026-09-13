'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">ngx-chessground documentation</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                                <li class="link">
                                    <a href="overview.html" data-type="chapter-link">
                                        <span class="icon ion-ios-keypad"></span>Overview
                                    </a>
                                </li>

                            <li class="link">
                                <a href="index.html" data-type="chapter-link">
                                    <span class="icon ion-ios-paper"></span>
                                        README
                                </a>
                            </li>
                        <li class="link">
                            <a href="changelog.html"  data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>CHANGELOG
                            </a>
                        </li>
                        <li class="link">
                            <a href="license.html"  data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>LICENSE
                            </a>
                        </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                                <li class="link">
                                    <a href="properties.html" data-type="chapter-link">
                                        <span class="icon ion-ios-apps"></span>Properties
                                    </a>
                                </li>

                    </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#components-links"' :
                            'data-bs-target="#xs-components-links"' }>
                            <span class="icon ion-md-cog"></span>
                            <span>Components</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="components-links"' : 'id="xs-components-links"' }>
                            <li class="link">
                                <a href="components/BoardDisplayComponent.html" data-type="entity-link" >BoardDisplayComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/EvaluationBarComponent.html" data-type="entity-link" >EvaluationBarComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/GameFilterPanelComponent.html" data-type="entity-link" >GameFilterPanelComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/LoadCachePanelComponent.html" data-type="entity-link" >LoadCachePanelComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/MoveListComponent.html" data-type="entity-link" >MoveListComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/NgxChessgroundComponent.html" data-type="entity-link" >NgxChessgroundComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/NgxChessgroundTableComponent.html" data-type="entity-link" >NgxChessgroundTableComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/NgxPgnViewerComponent.html" data-type="entity-link" >NgxPgnViewerComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/PlayerTypeaheadComponent.html" data-type="entity-link" >PlayerTypeaheadComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/PracticePanelComponent.html" data-type="entity-link" >PracticePanelComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/PromotionDialogComponent.html" data-type="entity-link" >PromotionDialogComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/ReplayPanelComponent.html" data-type="entity-link" >ReplayPanelComponent</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#injectables-links"' :
                                'data-bs-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/NgxChessgroundService.html" data-type="entity-link" >NgxChessgroundService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PgnCacheService.html" data-type="entity-link" >PgnCacheService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PgnViewerEngineService.html" data-type="entity-link" >PgnViewerEngineService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PgnViewerSettingsService.html" data-type="entity-link" >PgnViewerSettingsService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PgnViewerStoreService.html" data-type="entity-link" >PgnViewerStoreService</a>
                                </li>
                                <li class="link">
                                    <a href="injectables/PromotionService.html" data-type="entity-link" >PromotionService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interfaces-links"' :
                            'data-bs-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/BestMoveInfo.html" data-type="entity-link" >BestMoveInfo</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CachedCollection.html" data-type="entity-link" >CachedCollection</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CachedPgnData.html" data-type="entity-link" >CachedPgnData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/CacheEntry.html" data-type="entity-link" >CacheEntry</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ClockState.html" data-type="entity-link" >ClockState</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/DesktopMarker.html" data-type="entity-link" >DesktopMarker</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/DropdownPosition.html" data-type="entity-link" >DropdownPosition</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/EvaluationChange.html" data-type="entity-link" >EvaluationChange</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FilterCriteria.html" data-type="entity-link" >FilterCriteria</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FilterGameInfo.html" data-type="entity-link" >FilterGameInfo</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/GameMetadata.html" data-type="entity-link" >GameMetadata</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/LoadFromCachePayload.html" data-type="entity-link" >LoadFromCachePayload</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/LoadOptions.html" data-type="entity-link" >LoadOptions</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/LoadPayload.html" data-type="entity-link" >LoadPayload</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PersistedFilterState.html" data-type="entity-link" >PersistedFilterState</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PersistedViewerState.html" data-type="entity-link" >PersistedViewerState</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PgnSourceCacheEntry.html" data-type="entity-link" >PgnSourceCacheEntry</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PgnViewerEngineCallbacks.html" data-type="entity-link" >PgnViewerEngineCallbacks</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PgnViewerError.html" data-type="entity-link" >PgnViewerError</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PgnViewerNotice.html" data-type="entity-link" >PgnViewerNotice</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PgnViewerNotifier.html" data-type="entity-link" >PgnViewerNotifier</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PlayerSuggestion.html" data-type="entity-link" >PlayerSuggestion</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PlayerTypeaheadState.html" data-type="entity-link" >PlayerTypeaheadState</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PracticeExport.html" data-type="entity-link" >PracticeExport</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PracticeMove.html" data-type="entity-link" >PracticeMove</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/PromotionDialogData.html" data-type="entity-link" >PromotionDialogData</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TextSegment.html" data-type="entity-link" >TextSegment</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/TypeaheadKeyboardEvent.html" data-type="entity-link" >TypeaheadKeyboardEvent</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Unit.html" data-type="entity-link" >Unit</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#miscellaneous-links"'
                            : 'data-bs-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/typealiases.html" data-type="entity-link">Type aliases</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <a data-type="chapter-link" href="routes.html"><span class="icon ion-ios-git-branch"></span>Routes</a>
                        </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank" rel="noopener noreferrer">
                            <img data-src="images/compodoc-vectorise.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});