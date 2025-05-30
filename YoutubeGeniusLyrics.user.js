// ==UserScript==
// @name            Custom YouTube Genius Lyrics
// @namespace       https://github.com/scripttrip/genius_tampermonkey
// @description     Enhanced version of YouTube Genius Lyrics with custom themes and adjustable scroll speeds

// @license         GPL-3.0-or-later; http://www.gnu.org/licenses/gpl-3.0.txt
// @copyright       2024, Custom Version (Original by mazz https://github.com/cvzi)
// @author          Custom Version (scripttrip)
// @icon            https://raw.githubusercontent.com/scripttrip/genius_tampermonkey/refs/heads/main/11.png
// @supportURL      https://github.com/scripttrip/genius_tampermonkey/issues
// @version         1.0.0
// @require         https://raw.githubusercontent.com/scripttrip/genius_tampermonkey/refs/heads/main/GeniusLyrics.js
// @require         https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js
// @grant           GM.xmlHttpRequest
// @grant           GM.setValue
// @grant           GM.getValue
// @grant           GM.registerMenuCommand
// @grant           GM_addValueChangeListener
// @connect         genius.com
// @match           https://www.youtube.com/*
// @match           https://music.youtube.com/*
// @exclude         https://www.youtube.com/embed/*
// @exclude         https://www.youtube-nocookie.com/embed/*
// @exclude         https://www.youtube.com/live_chat*
// @exclude         https://www.youtube.com/live_chat_replay*
// @exclude         /^https?://\S+\.(png|jpg|jpeg|gif|xml|svg|manifest|log|ini)[^\/]*$/
// ==/UserScript==

/*
    Original Copyright (C) 2020 mazz (mazz@openmail.cc)
    Customized version with additional features
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/* global GM, genius, geniusLyrics, top, GM_addValueChangeListener, sessionStorage */ // eslint-disable-line no-unused-vars, no-redeclare
/* jshint asi: true, esversion: 8 */

'use strict'

let genius
const SCRIPT_NAME = 'Custom YouTube Genius Lyrics'
/** @type {globalThis.PromiseConstructor} */
const Promise = (async () => { })().constructor // YouTube polyfill to Promise in older browsers will make the feature being unstable.

let lyricsDisplayState = 'hidden'
let disableShowLyricsButton = false // hide if the page is confirmed as non-video page
let isYouTubeLive = false
let iframeBlankURL = null

// Custom variables for enhanced features
let currentScrollSpeed = 'normal' // 'slow', 'normal', 'fast'
let currentTheme = 'default' // 'default', 'dark', 'light', 'spotify', 'youtube'
let customWidth = null; // Store custom width for the lyrics container
let customHeight = null; // Store custom height for the lyrics container
let isResizing = false; // Track if user is currently resizing

const EXCLUDE_LIVE_VIDEO = true // this should be configurable in "options" ? [>=25min]
const EXCLUDE_SHORT_LEN = true // this should be configurable in "options" ? [<15s]

const elmBuild = (tag, ...contents) => {
  /** @type {HTMLElement} */
  const elm = typeof tag === 'string' ? document.createElement(tag) : tag
  for (const content of contents) {
    if (!content || typeof content !== 'object' || (content instanceof Node)) { // eslint-disable-line no-undef
      elm.append(content)
    } else if (content.length > 0) {
      elm.appendChild(elmBuild(...content))
    } else if (content.style) {
      Object.assign(elm.style, content.style)
    } else if (content.classList) {
      elm.classList.add(...content.classList)
    } else if (content.attr) {
      for (const [attr, val] of Object.entries(content.attr)) elm.setAttribute(attr, val)
    } else {
      Object.assign(elm, content)
    }
  }
  return elm
}

const elmBuildNS = (tag, ...contents) => {
  const ns = 'http://www.w3.org/2000/svg'
  /** @type {Element} */
  const elm = typeof tag === 'string' ? document.createElementNS(ns, tag) : tag
  for (const content of contents) {
    if (!content || typeof content !== 'object' || (content instanceof Node)) { // eslint-disable-line no-undef
      elm.append(content)
    } else if (content.length > 0) {
      elm.appendChild(elmBuildNS(...content))
    } else if (content.style) {
      Object.assign(elm.style, content.style)
    } else if (content.classList) {
      elm.classList.add(...content.classList)
    } else if (content.attr) {
      for (const [attr, val] of Object.entries(content.attr)) elm.setAttributeNS(null, attr, val)
    } else if (content.attrNS) {
      for (const [attr, val] of Object.entries(content.attrNS)) elm.setAttributeNS(ns, attr, val)
    } else {
      Object.assign(elm, content)
    }
  }
  return elm
}

function addCss () {
  let style = document.querySelector('style#youtube_genius_lyrics_style')
  if (style === null) {
    style = document.createElement('style')
    style.id = 'youtube_genius_lyrics_style'
    style.textContent = `
    body #mycaptchahint897454 {
      z-index: 2070;
    }

    body #myoverlay7658438 {
      z-index: 2050;
    }

    body #myconfigwin39457845 {
      z-index: 2060;
    }

    html {
      /* allow modification from external */
      --ygl-container-right: var(--ytd-margin-6x, 4px);
      --ygl-container-default-padding: 2px 6px;
      --ygl-spinner-color: rgb(255, 255, 100);
    }

    /* Custom Theme Variables */
    html[data-lyrics-theme="default"] {
      --lyrics-bg-color: var(--ytd-searchbox-background);
      --lyrics-text-color: var(--ytd-searchbox-text-color);
      --lyrics-accent-color: var(--yt-live-chat-toast-action-color);
      --lyrics-border-color: var(--ytd-searchbox-legacy-border-color);
      --lyrics-button-bg: #ffff64;
      --lyrics-button-color: #000a;
    }
    
    html[data-lyrics-theme="dark"] {
      --lyrics-bg-color: #181818;
      --lyrics-text-color: #e0e0e0;
      --lyrics-accent-color: #ffff64;
      --lyrics-border-color: #333;
      --lyrics-button-bg: #ffff64;
      --lyrics-button-color: #000a;
    }
    
    html[data-lyrics-theme="light"] {
      --lyrics-bg-color: #f5f5f5;
      --lyrics-text-color: #333;
      --lyrics-accent-color: #4285f4;
      --lyrics-border-color: #ddd;
      --lyrics-button-bg: #4285f4;
      --lyrics-button-color: #fff;
    }
    
    html[data-lyrics-theme="spotify"] {
      --lyrics-bg-color: #181818;
      --lyrics-text-color: #ffffff;
      --lyrics-accent-color: #1ed760;
      --lyrics-border-color: #333;
      --lyrics-button-bg: #1ed760;
      --lyrics-button-color: #000a;
    }
    
    html[data-lyrics-theme="youtube"] {
      --lyrics-bg-color: var(--yt-spec-base-background);
      --lyrics-text-color: var(--yt-spec-text-primary);
      --lyrics-accent-color: #ff0000;
      --lyrics-border-color: var(--yt-spec-10-percent-layer);
      --lyrics-button-bg: #ff0000;
      --lyrics-button-color: #fff;
    }

    #lyricscontainer {
      box-sizing: border-box;
      position: fixed;
      right: 0;
      margin: 0px;
      padding: 0px;
      z-index: 2001;
      font-size: 1.4rem;
      border: 0;
      border-radius: 0;
      resize: both;
      overflow: hidden;

      background: var(--lyrics-bg-color, var(--ytd-searchbox-background));
      color: var(--lyrics-text-color, var(--ytd-searchbox-text-color));
      border: 1px solid var(--lyrics-border-color, var(--ytd-searchbox-legacy-border-color));
      padding: var(--ygl-container-default-padding);
      /* overrided by found/loading */
      line-height: 100%;

      width: calc(var(--ygl-container-width, 324px) - var(--ytd-margin-6x, 24px) + 7px);
      right: calc(var(--ygl-container-right) - 1px);
      min-width: 250px;
      min-height: 200px;
    }

    /* Resize handle styles */
    .lyrics-resize-handle {
      position: absolute;
      width: 15px;
      height: 15px;
      bottom: 0;
      right: 0;
      cursor: nwse-resize;
      background: var(--lyrics-accent-color, var(--yt-live-chat-toast-action-color));
      clip-path: polygon(100% 0, 100% 100%, 0 100%);
      opacity: 0.7;
      z-index: 2010;
    }

    .lyrics-resize-handle:hover {
      opacity: 1;
    }

    #lyricsiframe {
      opacity: 0.1;
      transition: opacity 2s;
      margin: 0;
      padding: 0;
    }

    .lyricsnavbar {
      font-size: 0.83em;
      text-align: right;
      padding-right: 10px;
      background-color: #fafafa;
      background: transparent;
      color: inherit;
      display: flex;
      user-select: none;
      flex-direction: row;
      justify-content: end;
      align-items: center;
      align-items: stretch;
    }

    .lyricsnavbar span {
      color: var(--lyrics-text-color, var(--yt-live-chat-primary-text-color));
      text-decoration: none;
      transition: color 400ms;
    }

    .lyricsnavbar span:hover {
      color: var(--lyrics-accent-color, var(--yt-live-chat-toast-action-color));
      text-decoration: none;
    }

    /* Custom Controls */
    .lyrics-controls {
      display: flex;
      align-items: center;
      margin-right: auto;
      gap: 8px;
    }

    .lyrics-theme-selector,
    .lyrics-speed-selector {
      background: transparent;
      color: var(--lyrics-text-color);
      border: 1px solid var(--lyrics-border-color);
      border-radius: 3px;
      padding: 2px 4px;
      font-size: 0.85em;
      cursor: pointer;
    }

    .lyrics-theme-selector:hover,
    .lyrics-speed-selector:hover {
      border-color: var(--lyrics-accent-color);
    }

    .lyrics-theme-selector option,
    .lyrics-speed-selector option {
      background: var(--lyrics-bg-color);
      color: var(--lyrics-text-color);
    }

    body .loadingspinner {
      /* override .loadingspinner */
      color: currentColor;
      font-size: 1em;
      line-height: 2.5em;
      --ygl-spinner-border-color: var(--yt-live-chat-secondary-text-color, #181818);
      border-color: var(--ygl-spinner-color) var(--ygl-spinner-border-color) var(--ygl-spinner-border-color) var(--ygl-spinner-border-color);
    }

    .loadingspinnerholder {
      z-index: 2050;
      background-color: inherit;
      cursor: progress;
    }

    .lorem br {
      height: 0px;
      line-height: 0;
      font-size: 0;
      padding: 0;
      margin: 0;
    }

    .lorem {
      --ygl-lorem-gray: var(--yt-live-chat-disabled-icon-button-color);
      padding: 10px 0px 0px 15px;
      font-size: 1.4rem;
      line-height: 2.2rem;
      letter-spacing: 0.3rem;
      user-select: none !important;
      pointer-events: none !important;
      width: 100%;
    }

    /* this is only supported in modern browsers */
    @property --num {
      syntax: '<integer>';
      initial-value: 0;
      inherits: false;
    }

    @keyframes loadingLorem {
      0% {
        --num: 0;
      }

      99% {
        --num: 8;
      }

      100% {
        --num: 0;
      }
    }

    .lorem-scroll {
      --num: 0;
      animation: loadingLorem 4s ease infinite;
      margin-top: calc(-13rem - 2rem*var(--num, 0));
      contain: content;
      width: 96%;
      overflow: hidden;
    }

    .lorem .white {
      background-color: inherit;
      color: white;
      user-select: none !important;
    }

    .lorem .gray {
      background-color: var(--ygl-lorem-gray);
      color: transparent;
      user-select: none !important;
    }

    #showlyricsbutton {
      position: fixed; /* youtube's unknown layout bug - the 'absolute' position top would offset upwards by around 80px after the page is changed */
      /* note: youtube layouts are inside ytd-watch-flexy by default; therefore the 'absolute' layout for elements outside ytd-watch-flexy is not guaranteed */
      z-index: 3000;
      right: 4px;
      cursor: pointer;
      border-radius: 50%;
      margin: auto;
      padding: 0px 1px;
      text-align: center;
      font-size: 15px;
      line-height: 14px;

      background: var(--lyrics-button-bg, #ffff64);
      color: var(--lyrics-button-color, #000a);
      padding: 9px;
      display: flex;
      align-content: center;
      align-items: center;
      justify-content: center;
      contain: strict;
      opacity: 0.7;
      transition: opacity 50ms;

      /*
        --ytd-masthead-height
        --ytd-toolbar-height
        --ytd-watch-flexy-masthead-height
        */
      top: var(--ytd-toolbar-height, var(--ytd-masthead-height, var(--ytd-watch-flexy-masthead-height, 56px)));

    }

    #showlyricsbutton.hide-during-ytlive {
      display: none;
    }

    #showlyricsbutton:hover {
      opacity: 1.0;
    }

    /* :fullscreen shall be sufficient for modern browsers */
    /* see more at https://caniuse.com/mdn-css_selectors_fullscreen */
    /* just except opera ? */

    :fullscreen #showlyricsbutton, :fullscreen #lyricscontainer {
      display: none;
    }

    :-moz-full-screen #showlyricsbutton {
      display: none;
    }

    :-webkit-full-screen #showlyricsbutton {
      display: none;
    }

    #showlyricsbutton::before {
      color: inherit;
      content: 'G';
      position: absolute;
      display: block;
      pointer-events: none;
      user-select: none;
      touch-action: none;
    }

    .youtube-genius-lyrics-search-container {
      border: 1px solid black;
      border-radius: 3px;
      --ygl-lyricscontainer-padding: 0px 10px;
    }

    span.youtube-genius-lyrics-results-line-separator,
    span.youtube-genius-lyrics-found-separator {
      padding: 0px 3px;
    }

    .youtube-genius-lyrics-results-container {
      border: 1px solid black;
      border-radius: 3px;
    }

    ol.youtube-genius-lyrics-results-tracklist {
      list-style: none;
      width: 99%;
      font-size: 1.15em;
    }

    li.youtube-genius-lyrics-results-li {
      cursor: pointer;
      transition: background-color 0.2s;
      margin: 2px;
      border-radius: 3px;
      padding: 8px 6px;
    }

    span.youtube-genius-lyrics-results-hide-btn,
    span.youtube-genius-lyrics-results-back-btn,
    span.youtube-genius-lyrics-found-hide-btn,
    span.youtube-genius-lyrics-found-back-btn {
      cursor: pointer;
    }

    li.youtube-genius-lyrics-results-li div.onhover {
      display: none;
      margin-top: -0.25em;
    }

    li.youtube-genius-lyrics-results-li div.onout {
      display: block;
    }

    li.youtube-genius-lyrics-results-li:hover div.onhover {
      display: block;
    }

    li.youtube-genius-lyrics-results-li:hover div.onout {
      display: none;
    }

    ol.youtube-genius-lyrics-results-tracklist {
      font-size: var(--ytd-link-font-size);
    }

    li.youtube-genius-lyrics-results-li {

      /* --tyt-tracklist-li-background: var(--yt-live-chat-slider-container-color); */

      --tyt-tracklist-li-background: var(--ytd-searchbox-legacy-button-color);

      background-color: var(--tyt-tracklist-li-background);
      color: var(--ytd-searchbox-text-color);
      border: 1px solid var(--ytd-searchbox-legacy-border-color);
      list-style: none;

      /*
        color: var(--yt-live-chat-secondary-text-color);

          --tyt-tracklist-li-background: var(--ytd-searchbox-legacy-button-color);
          --tyt-tracklist-li-background: var(--yt-spec-commerce-tonal-hover);

        */

      opacity: 0.9;
    }

    li.youtube-genius-lyrics-results-li:hover {

      --tyt-tracklist-li-background: var(--yt-live-chat-button-dark-background-color);
      /* --tyt-tracklist-li-background: var(--yt-live-chat-slider-active-color); */
      border: 1px solid var(--ytd-searchbox-legacy-button-hover-border-color);

      opacity: 1.0;
    }

    li.youtube-genius-lyrics-results-li.lyrics-minor-result {
      font-size: 80%;
      opacity: 0.6;

    }

    li.youtube-genius-lyrics-results-li.lyrics-minor-result:hover {
      opacity: 0.7;
    }

    li.youtube-genius-lyrics-results-li * {
      pointer-events: none;
    }

    li.youtube-genius-lyrics-results-li div.onhover span {
      color: black;
      font-size: 2.0em;
    }

    li.youtube-genius-lyrics-results-li div.onout span {
      font-size: 1.5em;
    }


    body #lyricscontainer ol.tracklist li .onhover,
    body #lyricscontainer ol.tracklist li .onout {
      display: none;

    }


    body #lyricscontainer>ol.tracklist {

      max-width: 480px;
      min-width: 280px;
      width: auto;
    }


    span.youtube-genius-lyrics-found-config-btn {
      cursor: pointer;
    }

    span.youtube-genius-lyrics-found-wonglyrics-btn {
      cursor: pointer;
    }


    html {
      --ygl-theater-player-max-width: '--NULL--';
      --ygl-theater-player-float: '--NULL--';
    }

    html[youtube-genius-lyrics-container="found"] ytd-watch-flexy[theater],
    html[youtube-genius-lyrics-container="loading"] ytd-watch-flexy[theater] {
      --ygl-theater-player-max-width: 50%;
      --ygl-theater-player-float: right;
    }

    ytd-watch-flexy[theater] #movie_player .ytp-left-controls {
      max-width: var(--ygl-theater-player-max-width);
    }

    ytd-watch-flexy[theater] #movie_player .ytp-right-controls {
      float: var(--ygl-theater-player-float);
    }

    html[youtube-genius-lyrics-container="found"] ytd-watch-flexy[theater] #movie_player video[src],
    html[youtube-genius-lyrics-container="loading"] ytd-watch-flexy[theater] #movie_player video[src] {
      left: 0 !important;
    }

    html[youtube-genius-lyrics-container] #showlyricsbutton {
      display: none;
    }


    .youtube-genius-lyrics-search-input {
      -webkit-appearance: none;
      appearance: none;
      -webkit-font-smoothing: antialiased;
      background-color: transparent;
      border: none;
      box-shadow: none;
      color: inherit;
      font-family: Roboto, Noto, sans-serif;
      text-align: inherit;
      border: 1px solid currentColor;
      box-sizing: border-box;
      padding: 1px 0;
      margin: 0;
      outline-offset: 0px;
      outline: none;
      padding: 1px 6px;
      font-size: 80%;
      background-color: var(--yt-emoji-picker-search-background-color);
      border-color: currentColor;
      margin: 0 6px 0 6px;
      flex: 1;
    }

    [dark] .youtube-genius-lyrics-search-input {
      border-color: transparent;
    }

    .youtube-genius-lyrics-search-input:not(:focus)::placeholder {
      border-color: var(--yt-emoji-picker-search-placeholder-color);
      color: var(--yt-emoji-picker-search-placeholder-color);
    }

    .youtube-genius-lyrics-search-input.placeholder-lastfetch:not(:focus)::placeholder,
    .youtube-genius-lyrics-search-input.placeholder-lastfetch:focus::placeholder{
      color: var(--yt-spec-text-secondary);
      font-weight: bold;
    }

    .youtube-genius-lyrics-search-input:focus,
    .youtube-genius-lyrics-search-input:active {
      border-color: var(--paper-checkbox-checked-color);
    }

    span.youtube-genius-lyrics-search-search-btn {
      cursor: pointer;
      vertical-align: middle;
      align-self: center;
      display: inline-flex;
      margin-left: 0;
      margin-right: 8px;
    }



    .youtube-genius-lyrics-search-search-btn:hover {
      color: var(--yt-live-chat-toast-action-color);
    }

    span.youtube-genius-lyrics-search-search-btn > svg {
      fill: currentColor;
      pointer-events: none;
      touch-action: none;
      user-select: none;
    }

    @keyframes inputNoResult {
      0% {
        transform: translateX(0px);
      }

      25% {
        transform: translateX(-6px);
      }

      50% {
        transform: translateX(0px);
      }

      75% {
        transform: translateX(6px);
      }

      100% {
        transform: translateX(6px);
      }
    }

    .youtube-genius-lyrics-search-input.lyrics-input-noresult {
      border-color: red;
      opacity: 0.75;
      animation: inputNoResult 140ms;
      animation-iteration-count: 3;
    }

    .lyrics-searching {
      /* dont make animation here */
      filter: blur(0.7px);
      opacity: 0.85;
      pointer-events: none;
    }


    html {
      --ygl-lyricsiframe-flex: '--NULL--';
      --ygl-lyricscontainer-bottom: '--NULL--';
      --ygl-lyricscontainer-border-radius: '--NULL--';
      --ygl-lyricscontainer-padding: '--NULL--';
      --ygl-lyricscontainer-display: '--NULL--';
      --ygl-lyricscontainer-flex-direction: '--NULL--';
      --ygl-lyricscontainer-bar-padding: '--NULL--';
    }


    .youtube-genius-lyrics-loading-container,
    .youtube-genius-lyrics-found-container {
      --ygl-lyricsiframe-flex: 1;
      --ygl-lyricscontainer-bottom: 4px;
      /* allow override */
      --ygl-lyricscontainer-border-radius: 0px 0px 8px 8px;
      /* allow override */
      --ygl-lyricscontainer-padding: 0px 8px 8px 8px;
      /* allow override */
      --ygl-lyricscontainer-display: flex;
      --ygl-lyricscontainer-flex-direction: column;
      --ygl-lyricscontainer-bar-padding: 4px 6px;

    }


    .lyricsnavbar {
      padding: var(--ygl-lyricscontainer-bar-padding);
    }

    body #lyricscontainer {
      display: var(--ygl-lyricscontainer-display);
      flex-direction: var(--ygl-lyricscontainer-flex-direction);
      bottom: var(--ygl-lyricscontainer-bottom);
      border-radius: var(--ygl-lyricscontainer-border-radius);
      padding: var(--ygl-lyricscontainer-padding);
    }

    #lyricsiframe {
      flex: var(--ygl-lyricsiframe-flex);
    }



    #lyricscontainer.youtube-genius-lyrics-loading-container #lyricsiframe {

      position: absolute;

      width: 80%;
      height: 80%;
      transform: translate(10%, 10%);


    }

    #lyricscontainer.youtube-genius-lyrics-loading-container .loadingspinnerholder {

      position: relative;
      width: auto !important;
      top: auto !important;

      display: flex;
      flex-direction: column;

      align-content: center;
      align-items: center;
      justify-content: center;

      overflow: hidden;
      contain: content;
    }



    .youtube-genius-lyrics-search-container {
      --ygl-lyricscontainer-display: flex;
      --ygl-lyricscontainer-flex-direction: row;
      align-items: center;
    }

    .youtube-genius-lyrics-results-container {
      --ygl-lyricscontainer-padding: 2px 6px 6px 6px;
    }

    .youtube-genius-lyrics-search-hide-btn,
    .youtube-genius-lyrics-results-back-btn,
    .youtube-genius-lyrics-results-hide-btn,
    .youtube-genius-lyrics-results-config-btn,
    .youtube-genius-lyrics-search-config-btn {
      border: 1px solid var(--ytd-searchbox-background);
      margin: 3px;
      font-size: 0.83em;
      color: var(--yt-live-chat-primary-text-color);
      text-decoration: none;
      transition: color 400ms;
      cursor: pointer;
    }

    .youtube-genius-lyrics-search-hide-btn:hover,
    .youtube-genius-lyrics-results-back-btn:hover,
    .youtube-genius-lyrics-results-hide-btn:hover,
    .youtube-genius-lyrics-results-config-btn:hover,
    .youtube-genius-lyrics-search-config-btn:hover {
      color: var(--yt-live-chat-toast-action-color);
      text-decoration: none;
    }

    .youtube-genius-lyrics-results-line-separator {
      font-size: 0.83em;
      color: var(--yt-live-chat-primary-text-color);
    }

    .youtube-genius-lyrics-search-label {
      font-family: cursive;
      padding: 0px 6px;
      color: var(--yt-live-chat-primary-text-color);
      font-size: 80%;
    }

    [dark] .youtube-genius-lyrics-search-label {
      color: var(--yt-live-chat-author-chip-owner-background-color);
    }

    .youtube-genius-lyrics-tracklist-info-container{
      display: flex;
      column-gap: 6px;
      flex-direction: row;
      flex-wrap: nowrap;
    }

    .youtube-genius-lyrics-tracklist-info-primary{
      flex:1;
    }

    .youtube-genius-lyrics-tracklist-info-secondary{
      text-transform: uppercase;
      font-style: italic;
    }

    svg.svg-genius-pageviews {
      fill: currentColor;
      width: 10px;
      margin-right: 2px;
    }

    `
    document.head.appendChild(style)
  }
}

const { requestAnimationFrame, setTimeout, setInterval, clearTimeout, clearInterval } = (() => { // eslint-disable-line no-unused-vars
  let win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window // eslint-disable-line no-undef
  let removeIframeFn = null
  try {
    const frameId = 'vanillajs-iframe-v1'
    let frame = document.getElementById(frameId)
    if (!frame) {
      frame = document.createElement('iframe')
      frame.id = frameId
      const blobURL = typeof webkitCancelAnimationFrame === 'function' ? (frame.src = URL.createObjectURL(new Blob([], { type: 'text/html' }))) : null // avoid Brave Crash
      frame.sandbox = 'allow-same-origin' // script cannot be run inside iframe but API can be obtained from iframe
      let n = document.createElement('noscript') // wrap into NOSCRPIT to avoid reflow (layouting)
      n.appendChild(frame)
      const root = document.documentElement
      if (root) {
        root.appendChild(n)
        if (blobURL) Promise.resolve().then(() => URL.revokeObjectURL(blobURL))
        removeIframeFn = (setTimeout) => {
          const removeIframeOnDocumentReady = (e) => {
            e && win.removeEventListener('DOMContentLoaded', removeIframeOnDocumentReady, false)
            e = n
            n = win = removeIframeFn = 0
            setTimeout ? setTimeout(() => e.remove(), 200) : e.remove()
          }
          if (!setTimeout || document.readyState !== 'loading') {
            removeIframeOnDocumentReady()
          } else {
            win.addEventListener('DOMContentLoaded', removeIframeOnDocumentReady, false)
          }
        }
      }
    }

    const fc = frame ? frame.contentWindow : null
    if (fc) {
      try {
        const { requestAnimationFrame, setTimeout, setInterval, clearTimeout, clearInterval } = fc
        const res = { requestAnimationFrame, setTimeout, setInterval, clearTimeout, clearInterval }
        for (const k in res) res[k] = res[k].bind(win) // necessary
        if (removeIframeFn) Promise.resolve(res.setTimeout).then(removeIframeFn)
        return res
      } catch (e) {
        if (removeIframeFn) removeIframeFn()
      }
    }
  } catch (e) {
    console.warn(e)
  }

  // since the mechanism does not utilize async/await, use the old method as fallback.
  function isFakeWindow () {
    // window is not window in Spotify Web App
    return (window instanceof window.constructor) === false
  }
  /**
   * getTrueWindow
   * @returns {Window}
   */
  function getTrueWindow () {
    // this can bypass Spotify's window Proxy Object and obtain the original window object
    try {
      return new Function('return window')() // eslint-disable-line no-new-func
    } catch (e) {
      console.warn('the actual window object cannot be obtained.', e) // e.g. YouTube Music
      return window // fallback
    }
  }

  let trueWindow = isFakeWindow() ? getTrueWindow() : win
  const { requestAnimationFrame, setTimeout, setInterval, clearTimeout, clearInterval } = trueWindow
  const res = { requestAnimationFrame, setTimeout, setInterval, clearTimeout, clearInterval }
  for (const k in res) res[k] = res[k].bind(trueWindow) // necessary
  trueWindow = null

  if (removeIframeFn) Promise.resolve(res.setTimeout).then(removeIframeFn)
  return res
})()

function appendElements (target, elements) {
  if (typeof target.append === 'function') {
    target.append(...elements)
  } else {
    for (const element of elements) {
      target.appendChild(element)
    }
  }
}

const removeElements = (typeof window.DocumentFragment.prototype.append === 'function')
  ? function (elements) {
    document.createDocumentFragment().append(...elements)
  }
  : function (elements) {
    for (const element of elements) {
      element.remove()
    }
  }

function getMastheadHeight () {
  // can be replaced by youtube css custom properties
  const masthead = document.querySelector('ytd-masthead#masthead')
  return masthead.getBoundingClientRect().height
}

function calcContainerWidthTop () {
  let w
  const upnext = document.querySelector('#secondary #secondary-inner') || document.getElementById('upnext')
  const playlist = document.querySelector('ytd-playlist-panel-renderer#playlist')
  const video = document.querySelector('ytd-watch-flexy div#primary video')

  if (upnext && upnext.getBoundingClientRect().left > 0) {
    w = window.innerWidth - upnext.getBoundingClientRect().left - 5
  } else if (playlist && playlist.getBoundingClientRect().left > 0) {
    w = window.innerWidth - playlist.getBoundingClientRect().left - 5
  } else if (video) {
    w = window.innerWidth - 1.02 * video.getBoundingClientRect().right
  } else {
    w = window.innerWidth * 0.45
  }
  w = Math.min(window.innerWidth * 0.75, w)

  const top = getMastheadHeight()
  const isTheatherView = !!document.querySelector('ytd-watch-flexy[theater]')
  if (isTheatherView) {
    return {
      top,
      width: parseInt(0.3 * document.querySelector('#columns').clientWidth),
      isTheatherView
    }
  } else {
    return {
      top,
      width: w,
      isTheatherView
    }
  }
}

function setFrameDimensions (container, iframe, bar) { // eslint-disable-line no-unused-vars
  // if (!container || !iframe || !bar) {
  //   console.warn('elements not found in setFrameDimensions()')
  //   return
  // }
  // const bar = container.querySelector('.lyricsnavbar')
  // const width = iframe.style.width = container.clientWidth - 1 + 'px'
  // const height = iframe.style.height = window.innerHeight - bar.clientHeight - getMastheadHeight() + 'px'
  /*
  iframe.style.width = container.clientWidth - 1 + 'px'
  iframe.style.height = window.innerHeight - bar.clientHeight - getMastheadHeight() + 'px'

  if (genius.option.themeKey === 'spotify') {
    iframe.style.backgroundColor = '#181818'
    bar.style.backgroundColor = '#181818'
  } else {
    iframe.style.backgroundColor = ''
  }
  */

  // return [width, height]
}

let lastResizeDT = 0
function onResize () {
  const tdt = Date.now()
  lastResizeDT = tdt
  setTimeout(function () {
    if (tdt === lastResizeDT) {
      resize()
    }
  }, 600)
}

function resize () {
  const container = document.getElementById('lyricscontainer')

  if (!container) {
    return
  }

  const { top, width } = calcContainerWidthTop()

  // container.style.top = `${top}px`
  container.style.setProperty('--ygl-container-top', `${top}px`)
  container.style.top = 'var(--ytd-toolbar-height, var(--ytd-masthead-height, var(--ytd-watch-flexy-masthead-height, var(--ygl-container-top))))' // compatible with YouTube Live Borderless
  container.style.setProperty('--ygl-container-width', `${width}px`)

  // const iframe = document.getElementById('lyricsiframe')
  // if (iframe) {
  //   const bar = container.querySelector('.lyricsnavbar')
  //   if (bar) {
  //     setFrameDimensions(container, iframe, bar)
  //   }
  // }
}

function getCleanLyricsContainer () {
  let container = null

  const { top, width } = calcContainerWidthTop()

  if (!document.getElementById('lyricscontainer')) {
    container = document.createElement('div')
    container.id = 'lyricscontainer'
    document.body.appendChild(container)
  } else {
    container = document.getElementById('lyricscontainer')
    container.textContent = ''
    container.className = ''
    container.style = ''
  }

  // container.style.top = `${top}px`
  container.style.setProperty('--ygl-container-top', `${top}px`)
  container.style.top = 'var(--ytd-toolbar-height, var(--ytd-masthead-height, var(--ytd-watch-flexy-masthead-height, var(--ygl-container-top))))' // compatible with YouTube Live Borderless
  container.style.setProperty('--ygl-container-width', `${width}px`)

  document.body.appendChild(container)

  const result = document.getElementById('lyricscontainer')
  if (result !== container) {
    console.warn(SCRIPT_NAME + ' getCleanLyricsContainer() Could not insert the element correctly')
  }

  return result
}

function hideLyrics () {
  if (document.querySelector('.loadingspinnerholder') !== null) {
    genius.f.cancelLoading()
  }
  const elementsToBeRemoved = [...document.querySelectorAll('.loadingspinnerholder')]
  const lyricscontainer = document.getElementById('lyricscontainer')
  if (lyricscontainer) {
    elementsToBeRemoved.push(lyricscontainer)
  }
  document.documentElement.removeAttribute('youtube-genius-lyrics-container')
  const isHiding = elementsToBeRemoved.length > 0
  removeElements(elementsToBeRemoved)
  addLyricsButton()
  return isHiding
}

async function showLyricsButtonClicked () {
  removeLyricsButton()
  genius.option.autoShow = true // Temporarily enable showing lyrics automatically on song change
  addLyrics(true)
}

function addLyricsButton () {
  if (disableShowLyricsButton === true) return
  if (document.getElementById('showlyricsbutton')) {
    return
  }
  // const top = getMastheadHeight()
  const showlyricsbutton = document.createElement('div')
  showlyricsbutton.id = 'showlyricsbutton'
  if (isYouTubeLive) showlyricsbutton.classList.add('hide-during-ytlive')
  showlyricsbutton.setAttribute('title', 'Load lyrics from genius.com')
  showlyricsbutton.addEventListener('click', showLyricsButtonClicked, false)
  document.body.appendChild(showlyricsbutton)
}

function removeLyricsButton () {
  let showlyricsbutton = document.getElementById('showlyricsbutton')
  if (showlyricsbutton !== null) {
    try {
      showlyricsbutton.remove()
    } catch (e) {
      // do nothing
    }
  }
  showlyricsbutton = null
}

let lastVideoId = null
let lastForceVideoId = null
let hitMaps = null

function obtainDataCarouselLockups (ep) {
  if (!ep) {
    return null
  }
  let m = null
  try {
    m = ep.engagementPanelSectionListRenderer.content.structuredDescriptionContentRenderer.items[2].videoDescriptionMusicSectionRenderer.carouselLockups
  } catch (e) {
    m = null
  }
  return m
}

function getSimpleText (defaultMetadata) {
  if (!defaultMetadata) {
    return null
  }
  if (typeof defaultMetadata.simpleText === 'string') {
    return defaultMetadata.simpleText
  }
  if (defaultMetadata.runs) {
    const texts = defaultMetadata.runs.map(entry => entry.text)
    if (texts.length === 1 && typeof texts[0] === 'string') {
      return texts[0]
    }
  }
  return null
}

function simpleTextFixup (text) {
  return text.replace(/だ/g, 'だ')
}

function titleFix (text) {
  return text.replace(/\(([A-Za-z][a-z]+) ([Vv]ersion|[Vv]er\.?)\)/g, '($1)') // Genius Lyrics title use Ver. instead of Version; e.g. English Version
}

function removeEmojis (str) {
  return str.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{1F004}\u{1F0CF}\u{E0020}-\u{E007F}\u{FE0F}]/gu, '') // eslint-disable-line no-misleading-character-class
}

function getMusicTitleAndAuthor (pData) {
  const response = pData.response
  const engagementPanels = response.engagementPanels
  let carouselLockups = null
  for (const ep of engagementPanels) {
    const m = obtainDataCarouselLockups(ep)
    if (m !== null) {
      carouselLockups = m
      break
    }
  }

  if (carouselLockups && carouselLockups.length === 1) {
    let a1 = null
    let a2 = null
    try {
      a1 = carouselLockups[0].carouselLockupRenderer.infoRows[0].infoRowRenderer.defaultMetadata
      a2 = carouselLockups[0].carouselLockupRenderer.infoRows[1].infoRowRenderer.defaultMetadata
    } catch (e) { }
    a1 = getSimpleText(a1)
    a2 = getSimpleText(a2)

    if (a1 && a2 && typeof a1 === 'string' && typeof a2 === 'string') {
      let title = null
      try {
        title = pData.playerResponse.videoDetails.title
      } catch (e) { }
      if (title && typeof title === 'string') {
        a1 = removeEmojis(a1).trim().replace(/\s+/g, ' ')
        a1 = titleFix(simpleTextFixup(a1))
        a2 = simpleTextFixup(a2)
        title = removeEmojis(title).trim().replace(/\s+/g, ' ')
        title = simpleTextFixup(title)
        const newValue = `${a2} ${a1}`
        return {
          title,
          singer: a2,
          song: a1,
          text: newValue
        }
      }
    }
  } else if (carouselLockups && carouselLockups.length > 1) {
    setDisableShowLyricsButton(true) // one video with multiple musics
  }
  return null
}

function getYoutubeMainVideo () {
  let video = document.querySelector('#ytd-player #movie_player video[src]')
  if (video !== null) {
    return video
  }
  video = document.querySelector('video[src]')
  if (video !== null) {
    return video
  }
  return null
}

function isYoutubeVideoPlaying () {
  const videoPlayerContainer = document.querySelector('#ytd-player #movie_player')
  let video = null
  if (videoPlayerContainer) {
    const isPaused = videoPlayerContainer.classList.contains('paused-mode')
    if (isPaused) {
      return false
    }
    const isPlaying = videoPlayerContainer.classList.contains('playing-mode')
    if (isPlaying) {
      return true
    }
    video = window.HTMLElement.prototype.querySelector.call(videoPlayerContainer, 'video[src]')
    if (video !== null) {
      const paused = video.paused
      if (paused === true) {
        return false
      }
      if (paused === false) {
        return true
      }
    }
  }
  if (video === null) {
    video = document.querySelector('video[src]')
  }
  if (video !== null) {
    const paused = video.paused
    if (paused === true) {
      return false
    }
    if (paused === false) {
      return true
    }
  }
}

function keywordProcess (title, keywords, kHash) {
  const upperTitle = title.toUpperCase()
  return keywords.filter(keywordObj => {
    if (typeof keywordObj === 'object') {
      const keyword = keywordObj.keyword
      return title.includes(keyword)
    }
    const keyword = keywordObj
    const upperKeyword = keyword.toUpperCase()
    if (!upperTitle.includes(upperKeyword)) return false
    let type = kHash.get(keyword)
    if (!type) {
      type = 1
      if (/^[a-zA-Z]+$/.test(keyword)) {
        type = 3
        let ignoreCase = false
        if (keyword.length > 1) {
          if ((keyword === keyword.toLowerCase() || keyword === keyword.toUpperCase())) ignoreCase = true
          else if ((keyword === keyword.charAt(0).toUpperCase() + keyword.substring(1).toLowerCase())) ignoreCase = true
        }
        if (ignoreCase) type = 7
      }
      kHash.set(keyword, type)
    }
    if (type === 1) {
      return title.includes(keyword)
    } else if (type === 3) {
      return (new RegExp(`\\b${keyword}\\b`)).test(title)
    } else if (type === 7) {
      return (new RegExp(`\\b${keyword}\\b`, 'i')).test(title)
    }
    return false
  })
}

function makeKeyWords (keywords, songTitle) {
  keywords = [...keywords]
  songTitle.replace(/\[([^[\]]+)\]/g, (m, a) => {
    if (a !== a.trim()) return
    keywords.push(a)
  })
  keywords.sort((a, b) => a.length - b.length)
  let skipNexts = new Set()
  let newKeyWords = []
  const upperSongTitle = songTitle.toUpperCase()
  for (let keyword of keywords) {
    if (skipNexts.has(keyword)) continue
    keyword = keyword.replace(/[\t\r\n]+/g, ' ')
    const upperKeyWord = keyword.toUpperCase()
    const j = upperSongTitle.indexOf(upperKeyWord)
    if (j < 0) continue
    if (upperKeyWord === 'MV' || upperKeyWord === 'PV' || upperKeyWord === 'SONG' || upperKeyWord === 'MUSIC') continue
    keyword = songTitle.substring(j, j + keyword.length)
    const r = { keyword, upperKeyWord, splitLen: songTitle.split(keyword).length, isBracketed: false, foundAt: j }
    if (j >= 1) {
      r.isBracketed = songTitle.charAt(j - 1) === '[' && songTitle.charAt(j + keyword.length) === ']'
    }
    skipNexts.add(keyword)
    newKeyWords.push(r)
  }
  skipNexts.clear()
  skipNexts = null
  let isSkipped = false
  for (const keyword1 of newKeyWords) {
    for (const keyword2 of newKeyWords) {
      if (keyword1.keyword.length > keyword2.keyword.length) {
        if (keyword1.splitLen !== keyword2.splitLen) continue
        if (keyword1.upperKeyWord.includes(keyword2.upperKeyWord)) {
          isSkipped = true
          keyword2.skip = true
        }
      }
    }
  }
  if (isSkipped) newKeyWords = newKeyWords.filter(entry => !entry.skip)
  newKeyWords.sort((a, b) => a.foundAt - b.foundAt)
  return newKeyWords
}

function repeatReplace (text, searchValue, substring, count) {
  while (count > 0) {
    const text2 = text.replace(searchValue, substring)
    if (text2 === text) return text
    text = text2
    count--
  }
  return text
}

async function traditionalYtdDescriptionInfo (videoTitle, videoDetails) {
  let songArtists
  let songTitle = videoTitle

  // song title text processing
  songTitle = removeEmojis(songTitle)
  songTitle = songTitle
    .replace(/[\u180E\u200B-\u200D\u2060\uFEFF]+/g, '') // zero-spacing
    .replace(/[\s\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028-\u2029\u202F\u205F\u3000\u00B7\u237D\u2420\u2422\u2423]+/g, ' ') /* spacing */ // eslint-disable-line no-control-regex
  // .replace(/[\uFF01-\uFF0F\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u3000\u3001-\u303F\u2000-\u206F]+/g, ' ') // Symbols and Punctuation
    .replace(/│/g, '|')
    .replace(/【([^【】]+)】/g, '[$1]')
    .replace(/\(([^()]+)\)/g, '[$1]')
    .replace(/『([^『』]+)』/g, '[$1]')
    .replace(/「([^「」]+)」/g, '[$1]')
    .replace(/\[(MV|PV)\]/g, '')

  const keywords = (videoDetails || 0).keywords

  let wSongTitle = null
  if (videoDetails && keywords && keywords.length > 2) {
    let variants = new Set()
    variants.add(songTitle.trim())
    for (const s of songTitle.split('/')) {
      variants.add(s.trim())
    }
    for (const s of songTitle.split('|')) {
      // 『チェンソーマン』第９話ノンクレジットエンディング / CHAINSAW MAN #9 Ending│Aimer「Deep down」
      variants.add(s.trim())
    }
    variants = [...variants.keys()]
    let variantsX = new Map()
    let kHash = new Map()
    const mainwords = keywordProcess(songTitle, keywords, kHash)
    kHash.clear()
    kHash = null
    if (mainwords.length > 2) {
      const vKeywords = makeKeyWords(mainwords, songTitle)
      console.log(vKeywords)
      await Promise.all(variants.map(variant => {
        return new Promise(resolve => {
          const mainwords = keywordProcess(variant, vKeywords, null)
          let kMatch = 0
          let kBracket = 0
          for (const keywordObj of mainwords) {
            kMatch++
            if (keywordObj.isBracketed) kBracket++
          }
          // console.log(22,variant,kMatch, kBracket, mainwords)

          // 【MV】迷星叫 / MyGO!!!!!【オリジナル楽曲】
          // 【歌ってみた】大脳的なランデブー / Covered by 花鋏キョウ【Kanaria】
          if (kMatch === 2 || kMatch - kBracket === 2) {
            const m = kMatch === 2 ? mainwords : mainwords.filter(entry => !entry.isBracketed)
            const p = `${m[0].keyword}\t${m[1].keyword}`
            const lastAdded = variantsX.get(p)
            if (!lastAdded || (lastAdded && lastAdded.variant.length > variant.length)) variantsX.set(p, { variant, kMatch, kBracket }) // store the shortest match
          }
          resolve(0)
        })
      }))
    }

    if (variantsX.size === 1) {
      const values = [...variantsX.keys()]
      wSongTitle = values[0]
    } else if (variantsX.size > 1) {
      const entries = [...variantsX.entries()]
      entries.sort((a, b) => (b[1].kMatch * 100 + b[1].kBracket) - (a[1].kMatch * 100 + a[1].kBracket))
      if (entries[0][1].kMatch > entries[1][1].kMatch) {
        wSongTitle = entries[0][0]
      }
    }
    variantsX.clear()
    variantsX = null
    variants.length = 0
    variants = null
  }

  if (wSongTitle !== null) {
    const m = wSongTitle.split('\t')
    window.defaultSongTitle = `${m[0]} ${m[1]}`
    return { songTitle: wSongTitle, songArtistsArr: null }
  }

  // Symbols and Punctuation can be part of the artist name (e.g. &TEAM, milli-billi)
  songTitle = simpleTextFixup(songTitle)

  songTitle = songTitle.replace(/(Official )?(Lyrics Video|Lyric Video|Music Video|Promotion Video|Video)/gi, '')
  songTitle = songTitle.replace(/\b(PERFORMANCE VIDEO|official mv|karaoke mv|official|music mv|audio|music|video|karaoke)\b/gi, '')
  songTitle = songTitle.replace(/\(\s*\)|\[\s*\]/g, '')
  songTitle = songTitle.replace(/exclusive\s*-?/gi, '')
  songTitle = songTitle.replace(/-\s*-/gi, ' - ')
  songTitle = songTitle.replace(/([\uFF01-\uFF0F\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u3000\u3001-\u303F\u2000-\u206F\s])(MV|PV)\s*$/g, '$1')
  songTitle = songTitle.replace(/^\s*(MV|PV)([\uFF01-\uFF0F\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u3000\u3001-\u303F\u2000-\u206F\s])/g, '$2')
  songTitle = repeatReplace(songTitle, /\[\]/g, '', 8)
  songTitle = songTitle.trim()

  // YOASOBI[祝福] [[機動戦士ガンダム 水星の魔女]オープニングテーマ]
  // 結束バンド[星座になれたら]／ TVアニメ[ぼっち・ざ・ろっく！]第12話劇中曲
  const exec1 = /^[^[\](){}]+\[[^[\](){}]+\]/.exec(songTitle)
  if (exec1) {
    let tmpSongTitle = songTitle
    tmpSongTitle = tmpSongTitle.replace(/\[\[[^[\]{}()]+\](オープニングテーマ|オープニング|エンディングテーマ|エンディング|Opening\s?Song|Ending\s?Song|Opening|Ending)\]$/, ' ').trim()
    tmpSongTitle = tmpSongTitle.replace(/\[[^[\]{}()]*\s*(オープニングテーマ|オープニング|エンディングテーマ|エンディング|Opening\s?Song|Ending\s?Song|Opening|Ending)\]$/, ' ').trim()
    tmpSongTitle = tmpSongTitle.replace(/(TV)?\s*(アニメ|Anime)\[[^[\]{}()]+\][^[\]{}()]*$/, ' ').trim()
    if (tmpSongTitle.includes(exec1[0])) {
      songTitle = tmpSongTitle
    }
  }

  songTitle = repeatReplace(songTitle, /[／/]\s*$/g, '', 8)

  // Pattern: Artist  - Song title
  songTitle = songTitle.split(/\s+[-–]\s+/)

  if (songTitle.length === 1) {
    // Pattern: Artist[Song title]
    const m = songTitle[0].match(/^([^[\]{}()]+)\[([^[\]{}()]+)\]$/)
    if (m) {
      songTitle = [m[1], m[2]]
    }
  }

  if (songTitle.length === 1) {
    // Pattern: Artist | Song title
    const m = songTitle[0].match(/(.+?)\s*\|\s*(.+)/)
    if (m) {
      songTitle = [m[1], m[2]]
    }
  }

  if (songTitle.length === 1) {
    // Pattern: Artist "Song title"
    const m = songTitle[0].match(/(.+?)\s*[""''`´*]+(.+)[""''`´*]+/)
    if (m) {
      songTitle = [m[1], m[2]]
    }
  }

  if (songTitle.length === 1) {
    // Pattern: Songtitle by Artist
    const m = songTitle[0].match(/(.+?)\s+by\s+(.+)/)
    if (m) {
      songTitle = [m[2], m[1]]
    }
  }

  if (songTitle.length === 1 && 'author' in videoDetails) {
    // Fallback to video author name
    songArtists = videoDetails.author
    songArtists = songArtists.replace(/\b(vevo|official|music|channel)\b/gi, '')
    songArtists = songArtists.replace(/-\s*topic/gi, '')
  } else {
    songArtists = songTitle.shift().trim()
  }

  const songArtistsArr = songArtists.split(',').map(s => s.trim())
  songTitle = songTitle.join(' - ').trim()
  songTitle = genius.f.cleanUpSongTitle(songTitle)
  // return object result
  return { songTitle, songArtistsArr }
}

function newYtdDescriptionInfo (ytdDescriptionInfo) {
  let song = ytdDescriptionInfo.song
  const singer = ytdDescriptionInfo.singer
  song = song.replace('(Karaoke)', '')
  // return object result
  return { songTitle: `${singer}\t${song}`, songArtistsArr: null }
}

function getYtdAppData () {
  const ytdApp = document.querySelector('ytd-app')
  return (ytdApp.__data || 0).data || ytdApp.data || null
}

function isYtdAppReady () {
  let ytdAppData = null
  let videoDetails = null
  try {
    ytdAppData = getYtdAppData()
    if ('player' in ytdAppData && 'args' in ytdAppData.player && 'raw_player_response' in ytdAppData.player.args && 'videoDetails' in ytdAppData.player.args.raw_player_response) {
      videoDetails = ytdAppData.player.args.raw_player_response.videoDetails
    } else {
      videoDetails = ytdAppData.playerResponse.videoDetails
    }
  } catch (e) {
  }
  return !!videoDetails
}

function getVideoInfo (ytdAppData) {
  let videoDetails = null
  try {
    if ('player' in ytdAppData && 'args' in ytdAppData.player && 'raw_player_response' in ytdAppData.player.args && 'videoDetails' in ytdAppData.player.args.raw_player_response) {
      videoDetails = ytdAppData.player.args.raw_player_response.videoDetails || null
    } else {
      videoDetails = ytdAppData.playerResponse.videoDetails || null
    }
  } catch (e) {
    console.warn(SCRIPT_NAME + ' addLyrics() Could not find videoDetails')
    console.log(e)
    const m = document.location.href.match(/v=(\w+)&?/)
    videoDetails = {
      videoId: (m && m[1] ? m[1] : ''),
      keywords: [],
      shortDescription: ''
    }
  }
  return videoDetails // could be null
}

async function getPageSongInfo (ytdAppData, videoDetails) {
  let isMusic = false
  let ytdDescriptionInfo = null
  let videoTitle = null
  let genre = null
  let isFamilySafe = null

  // obtain the music info from modern meta panel
  ytdDescriptionInfo = getMusicTitleAndAuthor(ytdAppData)
  if (ytdDescriptionInfo !== null) {
    isMusic = true
  }
  // videoTitle
  try {
    videoTitle = getSimpleText(ytdAppData.playerResponse.microformat.playerMicroformatRenderer.title)
  } catch (e) { }
  // genre
  try {
    genre = ytdAppData.playerResponse.microformat.playerMicroformatRenderer.category
  } catch (e) { }

  if (typeof videoTitle !== 'string') {
    return null
  }

  console.log(`Youtube Genius Lyrics - Genre "${genre}" is found`)
  if (ytdDescriptionInfo === null) {
    if (genre === 'Music') {
      isMusic = true
    }
  }

  // isFamilySafe
  try {
    isFamilySafe = ytdAppData.playerResponse.microformat.playerMicroformatRenderer.isFamilySafe
  } catch (e) { }
  if (isFamilySafe === false) return null // not suitable to load lyrics; isFamilySafe shall not be false for music

  window.defaultSongTitle = null
  // traditionalYtdDescriptionInfo if ytdDescriptionInfo is not available
  const { songTitle, songArtistsArr } = (ytdDescriptionInfo === null)
    ? await traditionalYtdDescriptionInfo(videoTitle, videoDetails)
    : newYtdDescriptionInfo(ytdDescriptionInfo)

  // console.log(window.defaultSongTitle)
  // if (!isMusic && window.defaultSongTitle) isMusic = true
  return { songTitle, songArtistsArr, isMusic }
}

function setDisableShowLyricsButton (newValue) {
  if (newValue === disableShowLyricsButton) return
  disableShowLyricsButton = newValue
  if (disableShowLyricsButton === true) {
    removeLyricsButton()
  }
  // note: setting to false would not immediately generate the button
}

let mPageSongInfoPromise = null

async function addLyrics (force, beLessSpecific) {
  const isMainCall = arguments.length === 0
  if (isMainCall) setDisableShowLyricsButton(false) // reset to false for every addLyrics()
  try {
    const pRes = await Promise.race([mPageSongInfoPromise])
    if (!pRes) return // unknown error
    switch (pRes.status) {
      case -1: // rarely happen; only if addLyrics triggered when the page is still loading
        return
      case -2: // Not a video page, video page not visible, or any case that should disable the feature
        lastVideoId = null
        if (isMainCall) setDisableShowLyricsButton(true) // no button if the page is confirmed as non-video page like 'browse', 'search'
        genius.f.hideLyricsWithMessage()
        return
      case -3: // no video details or videoId
        lastVideoId = null
        if (isMainCall) setDisableShowLyricsButton(false) // try to get page info again when user clicks the button
        else if (force === true) setDisableShowLyricsButton(true) // no video details when the button is clicked
        genius.f.hideLyricsWithMessage()
        return
      default:
      // do nothing
    }
    const tmpVideoId = `${pRes.videoId}${genius.option.themeKey}${genius.option.fontSize}`
    if (lastVideoId === tmpVideoId && document.getElementById('lyricscontainer')) {
      // Same video id and same theme settings and lyrics are showing -> stop here
      return
    }
    lastVideoId = tmpVideoId

    const pageSongInfoRes = pRes.pageSongInfoRes // can be null
    // setDisableShowLyricsButton(true) might have called in getPageSongInfo
    if (!pageSongInfoRes) {
      // video id is known but the song info is unknown (or not suitable to show lyrics)
      // do not load lyrics even if force = true
      setDisableShowLyricsButton(true) // the page is loaded but no song info; disable the button
      genius.f.hideLyricsWithMessage()
      return
    }
    let { songTitle, songArtistsArr, isMusic } = pageSongInfoRes
    if (force) {
      isMusic = true
      lastForceVideoId = lastVideoId
    } else if (isMusic === false && (lastForceVideoId === null || lastForceVideoId !== lastVideoId)) {
      // show button if not disabled
      genius.f.hideLyricsWithMessage()
      return
    }

    const musicIsPlaying = isYoutubeVideoPlaying()
    genius.f.loadLyrics(force, beLessSpecific, songTitle, songArtistsArr, musicIsPlaying)
  } catch (e) {
    console.warn(e)
  }
}

let lastPos = null
function cubicBezier (p1x, p1y, p2x, p2y) {
  const p1 = {
    x: p1x,
    y: p1y
  }
  const p2 = {
    x: p2x,
    y: p2y
  }

  function w (t, u0, u1) {
    const f = 1 - t
    return 3 * f * f * t * u0 + 3 * f * t * t * u1 + t * t * t
  }

  function v (t, A, B, C) {
    return A * t * t * t + B * t * t + C * t
  }

  function vp (t, A, B, C) {
    return 3 * A * t * t + 2 * B * t + C
  }

  /* eslint-disable camelcase */
  const w_n1 = w(-1, p1.x, p2.x)
  const w_p1 = w(1, p1.x, p2.x)
  const w_p2 = w(2, p1.x, p2.x)
  const w_B = (w_n1 + w_p1) / 2
  const w_6A2B = w_p2 - 2 * w_p1 // 8-2; 4-2; 2-2
  const w_A = (w_6A2B - 2 * w_B) / 6
  const w_C = w_p1 - w_A - w_B
  /* eslint-enable camelcase */

  // Ax^3. Bx^2. Cx + 0
  // -1: -A + B - C
  // 1: A + B + C
  // 2: 8A + 4B + 2C

  // Ax^3 + Bx^2 + Cx + 0 = s
  // Ax^3 + Bx^2 + Cx - s = 0

  /* eslint-disable camelcase */
  let last_s = null
  let last_t = null
  let last_kvp = null
  return function cbpt (s) {
    if (s > 0 && s < 1) {
      let t = s // guess t0=s instead of t0=0.5
      if (last_s !== null) {
        // t_n = t_n-1 - (kv - s) / kvp = t_n-1 - kv / kvp + s / kvp
        // t'_0 = t_n-1 - (kv - s') / kvp = t_n-1 - kv / kvp + s' / kvp
        // t'_0 = t_n - s / kvp + s' / kvp = t_n + (s' - s) / kvp
        t = last_t + (s - last_s) / last_kvp
      }
      let u
      let i = 0
      let kvp = 0.0
      while (i < 2) {
        const kv = v(t, w_A, w_B, w_C)
        kvp = vp(t, w_A, w_B, w_C)
        const dt = (kv - s) / kvp
        t -= dt
        if (i > 0 && u < 0 && t < 0) {
          // do nothing
        } else if (i > 0 && u > 1 && t > 1) {
          // do nothing
        } else if (dt * dt < 0.00001) {
          i++
        }
        u = t
      }
      last_t = t
      last_s = s
      last_kvp = kvp
      return w(t, p1.y, p2.y)
    } else if (s >= 0 && s <= 1) { // avoid equal comparision for floating values
      return s
    } else {
      return null
    }
  }
  /* eslint-enable camelcase */
}

// https://cubic-bezier.com/#
// Define different scroll speed curves
const scrollSpeedCurves = {
  'slow': cubicBezier(.12, .05, .25, .46),    /* Very gentle curve for slow scrolling */
  'normal': cubicBezier(.21, .08, .42, .66),  /* Original curve from the script */
  'fast': cubicBezier(.35, .12, .6, .9)       /* Steeper curve for faster scrolling */
};

// Use the current scroll speed (initialized as 'normal')
const cbLyricsTime = function(s) {
  return scrollSpeedCurves[currentScrollSpeed](s);
}

// the adjustment is based on typical JPOP songs:
// 美波「カワキヲアメク」MV https://www.youtube.com/watch?v=0YF8vecQWYs
// GHOST / 星街すいせい(official) https://www.youtube.com/watch?v=IKKar5SS29E

// at the begining, slower to suit either with or without verse.
// for verse at the beginning, the lyrics will be upshifted for the first sentence
// for without verse at the beginning, the singer would not sing in a very fast pace, so it can be slowed down
// it usually singing ends before the media ends. it might be pure music to make listeners relax the emotion.
// the lyrics shall be ahead the timeline a bit

// verse at the middle would not affect much. It will be equvalent to ~3 lines scrolling.
// Usually there is blank line and new line with the word "[verse]" such that the scrolling will still match the lyrics

let isUpdateAutoScrollBusy = false
async function updateAutoScroll (video, force) {
  if (isUpdateAutoScrollBusy) return
  if (isTriggered !== true) return // not ready
  if (!genius.current.compoundTitle) return // not ready
  if (!video) {
    video = getYoutubeMainVideo()
    if (!video) return
  }
  isUpdateAutoScrollBusy = true
  const { currentTime, duration } = video
  let pos = currentTime / duration
  if (pos >= 0) {
    // do nothing
  } else {
    isUpdateAutoScrollBusy = false
    return // invalid currentTime or duration
  }
  if (`${lastPos}` !== `${pos}`) {
    lastPos = pos
    let ct = currentTime
    if (force !== true) {
      await new Promise(resolve => setTimeout(resolve, 30))
      const ct1 = video.currentTime
      if (`${video.duration}` === `${duration}` && ((ct1 - ct < 50 / 1000 && ct1 > ct) || `${ct1}` === `${ct}`)) {
        // if the video is playing or stopped, without change of media
        ct = ct1
        pos = ct / duration
      } else {
        isUpdateAutoScrollBusy = false
        return // invalid timechange
      }
    }
    if (duration > 15) { // skip for music <= 15s
      let k = 1.95 // the scrollbar will just disappear at the end of music
      if (duration > 80) {
        k = 3.21 // the singer shall stop a bit eariler than the media ends
        if (duration > 160) {
          k = 4.82
        }
      }
      // p0 = (d-k)/d
      // p1 = p0 + (m/d)*p0
      // p1 = d/d = 1
      // 1 - (d-k)/d = (m/d) * p0
      // k/d = m*p0/d
      // m = k/p0 = kd/(d-k)
      const m = k * duration / (duration - k) // offset at pos = 1.0
      const timelineOffset = m * pos // end scrolling earlier than video end by ${k}s; the scrollbar will disappear at the end of music
      ct += timelineOffset
      if (ct < 0) ct = 0
      if (ct > duration) ct = duration
      // ct=0; ct'=0
      // ct=y; ct'=y
      let cbFactor = 1.0
      if (ct > 0 && ct < duration) {
        const s = ct / duration // (0,1)
        // Get the adjusted scroll position based on current speed setting
        const s1 = await scrollSpeedCurves[currentScrollSpeed](s) // (0,1)
        cbFactor = s1 / s
      }
      pos = ct / duration * cbFactor
    }
    try {
      // Use a more robust call to ensure the lyrics scroll
      if (typeof genius.f.scrollLyrics === 'function') {
        genius.f.scrollLyrics(pos)
      }
    } catch (err) {
      console.warn('Error during lyrics scroll:', err)
    }
  }
  await new Promise(requestAnimationFrame) /* eslint-disable-line no-new */
  isUpdateAutoScrollBusy = false
}

function safeString (s) {
  return (s || 0).length > 0 ? `${s}` : ''
}

async function performSearch () {
  try {
    const container = document.querySelector('#lyricscontainer.youtube-genius-lyrics-search-container')
    const input = document.querySelector('input.youtube-genius-lyrics-search-input')
    if (!container || !input) return

    let inputValue = input.value
    if (!input.value) {
      inputValue = placeholderValue()
      window.lastUserInput = null
    } else {
      window.lastUserInput = inputValue
    }
    if (inputValue) {
      if (document.querySelector('.loadingspinnerholder') !== null) {
        genius.f.cancelLoading()
      }
      if (typeof genius.current.compoundTitle === 'string') {
        genius.f.forgetLyricsSelection(genius.current.compoundTitle, null)
      }
      try {
        input.blur()
      } catch (e) { }
      await Promise.resolve(0)
      container.classList.add('lyrics-searching')
      genius.f.searchByQuery(inputValue, container, (res) => {
        let c = document.querySelector('#lyricscontainer')
        try {
          if (res && res.status === 200) {
            const hits = res.hits
            if (!hits) return
            if (hits.length > 0) {
              listSongs(hits, container, inputValue)
            } else {
              input.classList.add('lyrics-input-noresult')
              window.incorrectInputValue = inputValue
            }
          }
        } catch (e) { }
        if (c !== null) {
          c.classList.remove('lyrics-searching')
        }
        c = null
      })
    } else {
      input.classList.add('lyrics-input-noresult')
      window.incorrectInputValue = ''
    }
  } catch (e) {
    console.warn(e)
  }
}

function onSearchLyricsKeyDown (ev) {
  const input = this
  if (typeof window.incorrectInputValue === 'string' && input.value !== window.incorrectInputValue) {
    window.incorrectInputValue = null
    input.classList.remove('lyrics-input-noresult')
  }
}

function onSearchLyricsKeyUp (ev) {
  const input = this
  if (ev.code === 'Escape') {
    ev.preventDefault()
    input.value = ''
  } else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') {
    ev.preventDefault()
    performSearch()
    return
  }
  if (typeof window.incorrectInputValue === 'string' && input.value !== window.incorrectInputValue) {
    window.incorrectInputValue = null
    input.classList.remove('lyrics-input-noresult')
  }
}
function onSearchLyricsSearchBtnClick (ev) {
  ev.preventDefault()
  performSearch()
}

function hideLyricsWithMessageAndStopAutoShow () {
  if (genius.option.autoShow === true) {
    const isLyricsPanelShown = lyricsDisplayState === 'loading' || lyricsDisplayState === 'loaded'
    if (isLyricsPanelShown) genius.option.autoShow = false // Temporarily disable showing lyrics automatically on song change
  }
  genius.f.hideLyricsWithMessage()
}

function onSearchLyricsHideBtnClick (ev) {
  hideLyricsWithMessageAndStopAutoShow()
}

function placeholderValue () {
  return safeString(window.lastUserInputConfirmed) || safeString(window.lastFetchedQuery) || safeString(window.defaultSongTitle) || ''
}

function showSearchField (query) {
  const spanLabel = document.createElement('span')
  spanLabel.classList.add('youtube-genius-lyrics-search-label')
  spanLabel.textContent = 'Search genius.com: '

  const input = document.createElement('input')
  input.classList.add('youtube-genius-lyrics-search-input')
  // input.placeholder = 'Search genius.com...'

  const searchBtn = document.createElement('span')
  searchBtn.classList.add('youtube-genius-lyrics-search-search-btn')

  searchBtn.appendChild(elmBuildNS('svg',
    {
      xmlns: 'http://www.w3.org/2000/svg'
    },
    {
      attr: {
        width: '12',
        height: '12',
        preserveAspectRatio: 'xMidYMid meet',
        viewBox: '0 0 342 342'
      }
    }, [
      'path', {
        attr: {
          d: 'M337 317 239 219C259 196 270 166 270 134 270 60 210 0 135 0S0 60 0 134 61 268 135 268C167 268 196 257 219 239L317 337C323 343 331 343 337 337S343 323 337 317ZM29 134C29 76 76 29 135 29S241 76 241 134 194 239 135 239 29 192 29 134Z'
        }
      }
    ]))

  // Hide button
  const hideButton = document.createElement('span')
  hideButton.classList.add('youtube-genius-lyrics-search-hide-btn')
  hideButton.textContent = 'Hide'
  hideButton.addEventListener('click', onSearchLyricsHideBtnClick, false)

  const configButton = createConfigBtn('youtube-genius-lyrics-search-config-btn')

  input.value = safeString(query) || ''
  if (typeof window.lastUserInput === 'string' && !input.value) {
    input.value = safeString(window.lastUserInput) || ''
  }
  const fetechQuery = placeholderValue()
  input.placeholder = fetechQuery || `${genius.option.defaultPlaceholder}`
  input.classList.toggle('placeholder-lastfetch', !!fetechQuery)

  let b = null // container
  window.incorrectInputValue = null

  input.addEventListener('keydown', onSearchLyricsKeyDown, false)
  input.addEventListener('keyup', onSearchLyricsKeyUp, false)
  searchBtn.addEventListener('click', onSearchLyricsSearchBtnClick, false)

  // flush DOM
  b = getCleanLyricsContainer()

  b.classList.add('youtube-genius-lyrics-search-container')
  document.documentElement.setAttribute('youtube-genius-lyrics-container', 'search')
  appendElements(b, [
    spanLabel,
    input,
    searchBtn,
    configButton,
    hideButton
  ])
  document.body.appendChild(b)

  new Promise(() => { /* eslint-disable-line no-new */
    input.focus()
  })
}

function createConfigBtn (cName) {
  const configButton = document.createElement('span')
  configButton.classList.add(cName)
  configButton.textContent = 'Options'
  configButton.addEventListener('click', function configButtonClick (ev) {
    genius.f.config()
  })
  return configButton
}

function onLyricsFoundHideBtnClick (ev) {
  hideLyricsWithMessageAndStopAutoShow()
}

function onLyricsFoundBackToSearchClick (ev) {
  showSearchField()
}

function setupLyricsDisplayDOM (song, searchresultsLengths) { // eslint-disable-line no-unused-vars
  // getCleanLyricsContainer
  const container = getCleanLyricsContainer()
  container.className = '' // custom.getCleanLyricsContainer might forget to clear the className if the element is reused
  container.classList.add('youtube-genius-lyrics-found-container')
  document.documentElement.setAttribute('youtube-genius-lyrics-container', 'found')
  // Set the theme attribute on the html element
  document.documentElement.setAttribute('data-lyrics-theme', currentTheme)

  if (typeof genius.f.isGreasemonkey === 'function' && genius.f.isGreasemonkey()) {
    // container.textContent = '';
    elmBuild(container,
      ['h2',
        'This script only works in ',
        ['a', {
          target: '_blank',
          href: 'https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/'
        }, 'Tampermonkey']
      ],
      'Greasemonkey is no longer supported because of this ',
      ['a', {
        target: '_blank',
        href: 'https://github.com/greasemonkey/greasemonkey/issues/2574'
      }, 'bug greasemonkey/issues/2574'],
      ' in Greasemonkey.'
    )
    return
  }

  let separator = document.createElement('span')
  separator.classList.add('second-line-separator')
  separator.classList.add('youtube-genius-lyrics-found-separator')
  separator.textContent = '•'

  const bar = document.createElement('div')
  bar.classList.add('lyricsnavbar')
  
  // Theme selector
  const controlsDiv = document.createElement('div')
  controlsDiv.classList.add('lyrics-controls')
  
  const themeSelector = document.createElement('select')
  themeSelector.classList.add('lyrics-theme-selector')
  themeSelector.title = 'Change theme'
  
  const themeOptions = [
    ['default', 'Default'],
    ['dark', 'Dark'],
    ['light', 'Light'],
    ['spotify', 'Spotify'],
    ['youtube', 'YouTube']
  ]
  
  themeOptions.forEach(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    if (value === currentTheme) {
      option.selected = true
    }
    themeSelector.appendChild(option)
  })
  
  themeSelector.addEventListener('change', function() {
    currentTheme = this.value
    document.documentElement.setAttribute('data-lyrics-theme', currentTheme)
    GM.setValue('lyrics_theme', currentTheme)
  })
  
  // Scroll speed selector
  const speedSelector = document.createElement('select')
  speedSelector.classList.add('lyrics-speed-selector')
  speedSelector.title = 'Adjust scroll speed'
  
  const speedOptions = [
    ['slow', 'Slow'],
    ['normal', 'Normal'],
    ['fast', 'Fast']
  ]
  
  speedOptions.forEach(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    if (value === currentScrollSpeed) {
      option.selected = true
    }
    speedSelector.appendChild(option)
  })
  
  speedSelector.addEventListener('change', function() {
    currentScrollSpeed = this.value
    GM.setValue('lyrics_scroll_speed', currentScrollSpeed)
  })
  
  controlsDiv.appendChild(themeSelector)
  controlsDiv.appendChild(speedSelector)

  /*
  // Resize button
  if ('initResize' in custom) {
    const resizeButton = document.createElement('span')
    resizeButton.style.fontSize = '1.8em'
    resizeButton.style.cursor = 'ew-resize'
    resizeButton.textContent = '⇹'
    resizeButton.addEventListener('mousedown', custom.initResize)
    elementsToBeAppended.push(resizeButton, separator.cloneNode(true))
  }
  */

  // Hide button
  const hideButton = document.createElement('span')
  hideButton.classList.add('youtube-genius-lyrics-found-hide-btn')
  hideButton.textContent = 'Hide'
  hideButton.addEventListener('click', onLyricsFoundHideBtnClick, false)

  // Config button
  const configButton = createConfigBtn('youtube-genius-lyrics-found-config-btn')
  let goToSearchBtn = null
  if (searchresultsLengths === 1) {
    // Wrong lyrics button
    const wrongLyricsButton = document.createElement('span')
    wrongLyricsButton.classList.add('youtube-genius-lyrics-found-wonglyrics-btn')
    wrongLyricsButton.textContent = 'Search lyrics'
    wrongLyricsButton.addEventListener('click', onLyricsFoundBackToSearchClick, false)
    goToSearchBtn = wrongLyricsButton
  } else if (searchresultsLengths > 1) {
    // Back button
    const backbutton = document.createElement('span')
    backbutton.classList.add('youtube-genius-lyrics-found-back-btn')
    backbutton.textContent = `Back to search (${searchresultsLengths - 1} other result${searchresultsLengths === 2 ? '' : 's'})`
    backbutton.addEventListener('click', onLyricsFoundBackToSearchClick, false)
    goToSearchBtn = backbutton
  }

  const iframe = document.createElement('iframe')
  if (typeof webkitCancelAnimationFrame === 'function') {
    iframe.src = (iframeBlankURL || (iframeBlankURL = URL.createObjectURL(new Blob([], { type: 'text/html' })))) // Brave
  }
  iframe.id = 'lyricsiframe'
  iframe.style.opacity = 0.1

  // Add resize handle
  const resizeHandle = document.createElement('div');
  resizeHandle.classList.add('lyrics-resize-handle');
  
  // Initialize resize functionality
  resizeHandle.addEventListener('mousedown', function(e) {
    isResizing = true;
    
    // Prevent iframe from capturing mouse events during resize
    iframe.style.pointerEvents = 'none';
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = container.offsetWidth;
    const startHeight = container.offsetHeight;
    
    const onMouseMove = function(e) {
      if (!isResizing) return;
      
      // Calculate new size
      const newWidth = startWidth + startX - e.clientX;
      const newHeight = startHeight + e.clientY - startY;
      
      // Apply new size with minimums
      if (newWidth >= 250) {
        container.style.width = newWidth + 'px';
        customWidth = newWidth;
      }
      
      if (newHeight >= 200) {
        container.style.height = newHeight + 'px';
        customHeight = newHeight;
      }
    };
    
    const onMouseUp = function() {
      isResizing = false;
      
      // Re-enable iframe events
      iframe.style.pointerEvents = '';
      
      // Save custom size
      if (customWidth && customHeight) {
        GM.setValue('lyrics_custom_width', customWidth);
        GM.setValue('lyrics_custom_height', customHeight);
      }
      
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    
    e.preventDefault();
  });

  // flush to DOM tree
  appendElements(bar, [
    controlsDiv,
    goToSearchBtn,
    separator.cloneNode(true),
    configButton,
    separator.cloneNode(true),
    hideButton
  ])
  appendElements(container, [bar, iframe, resizeHandle])

  // Apply saved custom size if available
  if (customWidth) container.style.width = customWidth + 'px';
  if (customHeight) container.style.height = customHeight + 'px';

  // clean up
  separator = null

  return {
    container,
    bar,
    iframe
  }
}

function getHitOfElement (li) {
  if (!li || li.nodeType !== 1 || !hitMaps) {
    return null
  }
  return hitMaps.get(li) || null
}

// function formatPageViews (stats) {
//   if (!stats) return null
//   return 'pageviews' in stats && typeof stats.pageviews === 'number' ? genius.f.metricPrefix(stats.pageviews, 1) : ' - '
// }

async function rememberLyricsSelection (title, artists, hit) {
  // in order to call "genius.f.rememberLyricsSelection(title, artists, jsonHit)", use async call to get jsonHit
  const jsonHit = await new Promise(function (resolve) { /* eslint-disable-line no-new */
    // this is not a complete async function, but it helps not to block the scripting
    resolve(JSON.stringify(hit))
  })
  genius.f.rememberLyricsSelection(title, artists, jsonHit)
}

function onLyricsResultsBackBtnClick (ev) {
  showSearchField()
}

function onLyricsResultsHideBtnClick (ev) {
  hideLyricsWithMessageAndStopAutoShow()
}

function onLyricsResultsTrackListClick (ev) {
  const tracklist = this
  const element = ev.target
  if (element.nodeName === 'LI') {
    const hit = getHitOfElement(element)
    if (hit !== null) {
      if (typeof window.lastUserInput === 'string') {
        window.lastUserInputConfirmed = window.lastUserInput
        window.lastUserInput = null
      }
      const compoundTitle = genius.current.compoundTitle
      const searchresultsLengths = tracklist.querySelectorAll('li').length
      genius.f.showLyrics(hit, searchresultsLengths)
      rememberLyricsSelection(compoundTitle, null, hit)
    }
  }
}

function convertPageViewsToText (pageviews) {
  if (!Number.isFinite(pageviews)) return 'NaN'
  if (pageviews <= 999) {
    return pageviews
  }
  if (pageviews <= 999949) {
    return `${+(pageviews / 1000).toFixed(1)}K`
  }
  // if(pageviews<=999949999){
  return `${+(pageviews / 1000000).toFixed(1)}M`
  // }
}

function listSongs (hits, container, query) {
  // Back to search button
  const backToSearchButton = document.createElement('span')
  backToSearchButton.classList.add('youtube-genius-lyrics-results-back-btn')
  backToSearchButton.textContent = 'Back to search'
  backToSearchButton.addEventListener('click', onLyricsResultsBackBtnClick, false)

  const separator = document.createElement('span')
  separator.classList.add('second-line-separator')
  separator.classList.add('youtube-genius-lyrics-results-line-separator')
  separator.textContent = '•'

  // Hide button
  const hideButton = document.createElement('span')
  hideButton.classList.add('youtube-genius-lyrics-results-hide-btn')
  hideButton.textContent = 'Hide'
  hideButton.addEventListener('click', onLyricsResultsHideBtnClick, false)

  // Config button
  const configButton = createConfigBtn('youtube-genius-lyrics-results-config-btn')

  // List search results
  const tracklistOL = document.createElement('ol')
  tracklistOL.classList.add('tracklist')
  tracklistOL.classList.add('youtube-genius-lyrics-results-tracklist')
  tracklistOL.addEventListener('click', onLyricsResultsTrackListClick, true)

  let autoHit = autoSelectLyrics(hits) // setup _matchSource
  if (autoHit) autoHit = autoHit.hit
  const isTopResultBeingAutoHit = autoHit === hits[0]

  // prepare results
  const liArr = hits.map(function hitsMap (hit) {
    const li = document.createElement('li')
    li.classList.add('youtube-genius-lyrics-results-li')
    const resultUrl = hit.result.url
    const resultPageViews = (hit.result.stats || 0).pageviews
    li.setAttribute('data-result-url', resultUrl)
    li.setAttribute('data-result-pageviews', resultPageViews)
    // li.setAttribute('title', `${Number.isFinite(resultPageViews) ? convertPageViewsToText(resultPageViews) + "\n" : ""}${resultUrl}`)

    if (isTopResultBeingAutoHit && hit._order === hits[0]._order && hit._matchScore === hits[0]._matchScore) {
      li.classList.add('lyrics-major-result')
    } else {
      li.classList.add('lyrics-minor-result')
    }
    li.setAttribute('title', `${hit.result.title_with_featured}`)

    const showPageViews = true // no need to show this; pageviews usually NaN
    const showLyricsState = true

    /* eslint-disable operator-linebreak, indent, multiline-ternary */
    elmBuild(li,
      ['div',
        ['div', { classList: ['onhover'] }, ['span', '🅖']],
        ['div', { classList: ['onout'] }, ['span', '📄']]
      ],
      ['div', { classList: ['youtube-genius-lyrics-tracklist-info-container'] },
        ['p', { classList: ['youtube-genius-lyrics-tracklist-info-primary'] }, `${hit.result.primary_artist.name} • ${hit.result.title}`],
        showPageViews && showLyricsState && Number.isFinite(resultPageViews) ?
          ['p', { classList: ['youtube-genius-lyrics-tracklist-info-secondary'] },
            ['span', { style: { 'font-size': '0.7em' } },
              elmBuildNS('svg', { classList: ['svg-genius-pageviews'] }, { attr: { viewBox: '-38 -27 76 54' } },
                ['path', { attr: { d: 'M0-25C21-25 35 0 35 0S21 25 0 25-35 0-35 0-21-25 0-25zm0 7C-13-18-23-6-28 0c5 6 15 18 28 18S23 6 28 0C23-6 13-18 0-18M0-7a7 7 90 1 1-7 7 7 7 90 0 1 7-7m0-5A12 12 90 1 0 12 0 12 12 90 0 0 0-12z' } }]
              ),
              `${convertPageViewsToText(resultPageViews) || ''} ${hit.result.lyrics_state}`
            ]
          ] : '',
        !showPageViews && showLyricsState ? ['p', { classList: ['youtube-genius-lyrics-tracklist-info-secondary'] }, ['span', { style: { 'font-size': '0.7em' } }, `${hit.result.lyrics_state}`]] : ''
      ],
      ['div', { style: { clear: 'left' } }]
    )
    /* eslint-enable operator-linebreak, indent, multiline-ternary */

    if (!hitMaps) {
      hitMaps = new WeakMap()
    }
    hitMaps.set(li, hit)
    return li
  })
  appendElements(tracklistOL, liArr)

  // Flush DOM
  if (!container) {
    container = getCleanLyricsContainer()
  } else {
    container.className = ''
    container.textContent = ''
  }
  container.classList.add('youtube-genius-lyrics-results-container')
  document.documentElement.setAttribute('youtube-genius-lyrics-container', 'results')
  appendElements(container, [
    backToSearchButton,
    separator,
    configButton,
    separator.cloneNode(true),
    hideButton,
    tracklistOL
  ])
}

function loremIpsum () {
  const random = (x) => 1 + parseInt(Math.random() * x)

  // Create a container for the entire content
  const container = document.createElement('div')

  for (let v = 0; v < Math.max(3, random(5)) + 4; v++) {
    for (let b = 0; b < random(6); b++) {
      const lineContainer = document.createElement('span')
      lineContainer.classList.add('gray')

      for (let l = 0; l < random(9); l++) {
        for (let w = 0; w < 1 + random(10); w++) {
          for (let i = 0; i < 1 + random(7); i++) {
            // Create and append 'x' text node
            const xTextNode = document.createTextNode('x')
            lineContainer.appendChild(xTextNode)
          }

          // Add the whitespace span
          const whiteSpaceSpan = document.createElement('span')
          whiteSpaceSpan.classList.add('white')
          whiteSpaceSpan.textContent = '\u00A0' // Non-breaking space
          lineContainer.appendChild(whiteSpaceSpan)
        }

        // Add line break (br) after each set
        lineContainer.appendChild(document.createElement('br'))
      }

      // Append the line container to the main container
      container.appendChild(lineContainer)

      // Add a line break after each section
      container.appendChild(document.createElement('br'))
    }
  }

  return container // Return the main container with all generated elements
}

function createSpinner (spinnerHolder) {
  lyricsDisplayState = 'loading'
  const lyricscontainer = document.getElementById('lyricscontainer')
  lyricscontainer.className = ''
  lyricscontainer.classList.add('youtube-genius-lyrics-loading-container')
  document.documentElement.setAttribute('youtube-genius-lyrics-container', 'loading')

  const spinner = spinnerHolder.appendChild(document.createElement('div'))
  spinner.classList.add('loadingspinner')

  const lorem = loremIpsum()
  lorem.classList.add('lorem', 'lorem-scroll')
  spinnerHolder.appendChild(lorem)

  return spinner
}

function customSpinnerDOM (container, bar, iframe) {
  const spinnerDOM = {
    createSpinnerHolder: () => {
      const spinnerHolder = document.createElement('div')
      spinnerHolder.classList.add('loadingspinnerholder')
      spinnerDOM.spinnerHolder = spinnerHolder
    },
    createSpinner: () => {
      let spinner = null
      const spinnerHolder = spinnerDOM.spinnerHolder
      spinner = createSpinner(spinnerHolder)
      spinnerDOM.spinner = spinner
    },
    displaySpinnerHolder: () => {
      container.appendChild(spinnerDOM.spinnerHolder)
    },
    setStatusTitle: (title) => {
      const spinnerHolder = spinnerDOM.spinnerHolder
      spinnerHolder.title = title
    },
    setSpinnerNum: (text) => {
      const spinner = spinnerDOM.spinner
      spinner.textContent = text
    },
    remove: (text) => {
      const spinnerHolder = spinnerDOM.spinnerHolder
      spinnerHolder.remove()
    }
  }
  return spinnerDOM
}

function iframeLoadedCallback1 (res) {
  lyricsDisplayState = 'loaded'
}

function iframeLoadedCallback2 (res) {
  // nothing
}

function textSlash (text) {
  // Create a set object which contains the information of the title
  text = text
    .replace(/\b([a-z0-9A-Z]+)[:~\-+]([a-z0-9A-Z]+)\b/, '$1$3')
    .replace(/[\uFF01-\uFF5E]/g, (m) => {
      // Halfwidth and Fullwidth Forms
      return String.fromCharCode(m.charCodeAt(0) - 65248)
    })
    .replace(/[\u180E\u200B-\u200D\u2060\uFEFF]+/g, '') // zero-spacing
    .replace(/[\s\u0009-\u000D\u0020\u0085\u00A0\u1680\u2000-\u200A\u2028-\u2029\u202F\u205F\u3000\u00B7\u237D\u2420\u2422\u2423]+/g, '/') /* spacing */ // eslint-disable-line no-control-regex
    .replace(/[\uFF01-\uFF0F\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E\u3000\u3001-\u303F\u2000-\u206F]+/g, '/') // Symbols and Punctuation
    .replace(/\/+/g, '/')
  let s = text.split('/')
  const r = new Set()
  for (let t of s) {
    if (t && t.length > 0) {
      t = t.toLowerCase()
      if (!r.has(t)) {
        r.add(t)
      }
    }
  }
  s = null
  return r
}

function autoSelectLyrics (hits) {
  // only do title matching (+channel name)
  // to search the lyrics, use the short title
  // to figure out which one is the most correct one, use full / featured title

  const ytdApp = document.querySelector('ytd-app')
  let ytdAppData = null
  let videoDetails = null
  if (!ytdApp) return

  ytdAppData = getYtdAppData()
  if ('player' in ytdAppData && 'args' in ytdAppData.player && 'raw_player_response' in ytdAppData.player.args && 'videoDetails' in ytdAppData.player.args.raw_player_response) {
    videoDetails = ytdAppData.player.args.raw_player_response.videoDetails
  } else {
    videoDetails = ytdAppData.playerResponse.videoDetails
  }

  const videoTitle = videoDetails.title

  if (typeof videoTitle !== 'string') return

  // console.log(videoDetails)
  // console.log(videoTitle, textSlash(videoTitle))

  const slashVideoTitle = textSlash(`${videoTitle}\n${videoDetails.author || ''}`)
  let automaticHit = null

  for (const hit of hits) {
    const result = hit.result || 0
    const fTitle = result.full_title || result.title_with_featured || result.title
    if (!fTitle || typeof fTitle !== 'string') continue
    const slashFTitle = textSlash(`${fTitle}\n${result.artist_names || ''}`)
    let score = 0
    for (const key of slashFTitle.keys()) {
      if (slashVideoTitle.has(key)) score++
    }
    hit._matchScore = score
    if (automaticHit === null || hit._matchScore > automaticHit._matchScore) {
      automaticHit = hit
    }
  }

  // console.log(hits, automaticHit)

  if (automaticHit !== null) {
    return {
      hit: automaticHit
    }
  }
}

function main () {
  // do nothing
}
async function readPageSongInfo () {
  mPageSongInfoPromise = null

  let ytdAppData = getYtdAppData()
  if (!ytdAppData) {
    // the status is unknown
    return
  } else if (ytdAppData.page !== 'watch' || !isYtdAppReady()) {
    // ytdApp is initized but the pagetype or video info not exist
    // (youtube web app page to 'search' or 'browse')
    setDisableShowLyricsButton(true)
    genius.f.hideLyricsWithMessage()
    return
  }
  ytdAppData = null

  mPageSongInfoPromise = new Promise(resolve => {
    // ytd application data
    const ytdAppData = getYtdAppData()
    if (!ytdAppData) return resolve({ status: -1 }) // rarely happen; only if addLyrics triggered when the page is still loading
    if (ytdAppData.page !== 'watch') {
      // Not a video page or video page not visible
      return resolve({ status: -2 })
    }

    // ytd video data
    const videoDetails = getVideoInfo(ytdAppData)
    if (!videoDetails || !videoDetails.videoId) {
      return resolve({ status: -3 })
    }

    const lengthSeconds = +videoDetails.lengthSeconds
    if (Number.isFinite(lengthSeconds)) {
      if (EXCLUDE_SHORT_LEN && lengthSeconds < 15) { // 15s
        return resolve({ status: -3 })
      }
      if (EXCLUDE_LIVE_VIDEO && videoDetails.isLiveContent && lengthSeconds > 1500) { // 25min
        return resolve({ status: -3 })
      }
    }

    getPageSongInfo(ytdAppData, videoDetails).then(pageSongInfoRes => {
      // pageSongInfoRes can be null
      setDisableShowLyricsButton(false)
      resolve({ status: 1, pageSongInfoRes, videoId: videoDetails.videoId })
    })
  })
}
async function actionAddLyricsOrButton () {
  if (lyricsDisplayState === 'loading') {
    // avoid iframe communcation error
    return
  }
  if (isYouTubeLive) {
    setDisableShowLyricsButton(true)
    genius.f.hideLyricsWithMessage()
    return
  }
  let mPageSongInfoRes = await mPageSongInfoPromise
  if (mPageSongInfoRes && mPageSongInfoRes.status === 1) {
    if (genius.option.autoShow) {
      addLyrics()
    } else {
      addLyricsButton()
    }
  }
  mPageSongInfoRes = null
}

let isTriggered = false
async function executeMainWhenVisible (t, mPageLoadId) {
  if (isTriggered || mPageLoadId !== pageLoadId) return
  await new Promise(resolve => setTimeout(resolve, t)) /* eslint-disable-line no-new */
  if (isTriggered || mPageLoadId !== pageLoadId) return
  isTriggered = true
  actionAddLyricsOrButton()
}
function isYouTubeLiveFn () {
  const ytpLive = document.querySelector('.ytp-live')
  isYouTubeLive = ytpLive !== null && ytpLive.matches('[hidden] div.ytp-live') === false // just use simple DOM checking
  const lyricsBtn = document.querySelector('#showlyricsbutton')
  if (lyricsBtn !== null) lyricsBtn.classList.toggle('hide-during-ytlive', isYouTubeLive)
  return isYouTubeLive
}
let pageLoadId = 0
function delayedMain () {
  pageLoadId++
  if (pageLoadId > 1e9) pageLoadId = 9
  if (genius && genius.current) {
    genius.current.compoundTitle = null
  }
  isTriggered = false
  // time allowed for other userscript(s) prepare the page
  // and also not block the page
  window.lastFetchedQuery = null // reset search when media changed
  window.lastUserInput = null
  window.lastUserInputConfirmed = null
  window.defaultSongTitle = null
  isYouTubeLiveFn()
  const mPageLoadId = pageLoadId
  requestAnimationFrame(() => {
    if (mPageLoadId !== pageLoadId) return
    // only execute in foreground tab
    genius.f.hideLyricsWithMessage()
    readPageSongInfo()
    executeMainWhenVisible(200, mPageLoadId)
  })
}

function newAppHint (status) {
  // TODO should this be removed in favor of a README hint in the next version?

  if (document.getElementById('youtube-music-genius-lyrics-style')) {
    // Other script already running
    return GM.setValue('newapphint', -1)
  }

  if (status % 10 === 0) {
    let style = document.querySelector('style#newapphint785_style')
    if (style === null) {
      style = document.createElement('style')
      style.id = 'newapphint785_style'
      style.textContent = `
      #newapphint785 {
        position:fixed;
        top:0%;
        left:0%;
        padding:10px;
        background-color:#202020;
        color:#bbb;
        font-size:large;
        border:2px solid red;
        border-radius: 5px;
        box-shadow: red 1px 1px 10px;
        transition:left 500ms, top 500ms;
        z-index:2500
      }
      #newapphint785 a:link, #newapphint785 a:visited {
        color:white;
        text-decoration:none
      }
      #newapphint785 a:hover {
        color:#b0ae10;
        text-decoration:none
      }
      #newapphint785 button {
        font-size: large;
        background: #555;
        border: 2px outset #555;
        margin: 3px 10px;
        padding: 2px;
        color: #eee;
      }
      #newapphint785 button:hover {
        border: 2px outset #fff;
        color: #fff;
      }
      `
      document.head.appendChild(style)
    }

    const container = document.createElement('div')
    container.id = 'newapphint785'
    document.body.appendChild(container)

    const h2 = container.appendChild(document.createElement('h2'))
    h2.textContent = '⚠️ Youtube Genius Lyrics 🆕'
    const p = container.appendChild(document.createElement('p'))
    p.textContent = '▶️ The "Youtube Genius Lyrics" UserScript is only applied on youtube.com. To view Genius lyrics on music.youtube.com, please install the separate UserScript, "Youtube Music Genius Lyrics".'
    p.appendChild(document.createElement('br'))
    p.appendChild(document.createElement('br'))

    const aSource = p.appendChild(document.createElement('a'))
    aSource.target = '_blank'
    aSource.href = 'https://greasyfork.org/en/scripts/406892-youtube-music-genius-lyrics'
    aSource.textContent = '📑 https://greasyfork.org/en/scripts/406892-youtube-music-genius-lyrics'

    p.appendChild(document.createElement('br'))
    p.appendChild(document.createElement('br'))

    const aInstall = p.appendChild(document.createElement('a'))
    aInstall.href = 'https://greasyfork.org/scripts/406892-youtube-music-genius-lyrics/code/Youtube%20Music%20Genius%20Lyrics.user.js'
    aInstall.textContent = '💘 Click to install new script'
    aInstall.addEventListener('click', function () {
      GM.setValue('newapphint', -1).then(function () {
        aInstall.textContent = 'ℹ️ Please reload (F5) the page after installing'
      })
    })

    p.appendChild(document.createElement('br'))
    p.appendChild(document.createElement('br'))

    const remindMeLater = container.appendChild(document.createElement('button'))
    remindMeLater.textContent = '🔜 Remind me later'
    remindMeLater.addEventListener('click', function () {
      GM.setValue('newapphint', 1).then(() => container.remove())
    })

    container.appendChild(document.createElement('br'))

    const doNotShowAgain = container.appendChild(document.createElement('button'))
    doNotShowAgain.textContent = '🆗🆒 Do not show again'
    doNotShowAgain.addEventListener('click', function () {
      GM.setValue('newapphint', -1).then(() => container.remove())
    })

    setTimeout(function () {
      container.style.left = `calc(50% - ${container.clientWidth / 2}px)`
      container.style.top = `calc(50% - ${container.clientHeight / 2}px)`
    }, 100)
  } else if (status > 0) {
    GM.setValue('newapphint', status + 1)
  }
}

function entryPoint () {
  genius = null
  let isInIframe = null
  try {
    isInIframe = top && window && top.constructor.name === 'Window' && window.constructor.name === 'Window' && top !== window
  } catch (e) { }
  const isRobotsTxt = document.location.href.indexOf('robots.txt') >= 0
  if (document.location.hostname.startsWith('music')) {
    if (isRobotsTxt || isInIframe) return
    GM.getValue('newapphint', 0).then(function (status) {
      setTimeout(() => newAppHint(status), 5000)
    })
  } else {
    const setupMain = isRobotsTxt
      ? function setupMain () {
        // do nothing
      }
      : function setupMain () {
        const mPageLoadId = pageLoadId
        requestAnimationFrame(() => {
          if (mPageLoadId !== pageLoadId) return
          executeMainWhenVisible(600, mPageLoadId)
        })
        document.removeEventListener('yt-navigate-finish', delayedMain, false)
        document.addEventListener('yt-navigate-finish', delayedMain, false)
        isYouTubeLiveFn()
      }
    if (isInIframe && !isRobotsTxt) return

    let defaultOptions = null
    try {
      defaultOptions = sessionStorage[`geniusOptions_${SCRIPT_NAME}`]
      if (defaultOptions) defaultOptions = JSON.parse(defaultOptions)
    } catch (e) { }
    
    // Load saved settings
    Promise.all([
      GM.getValue('lyrics_theme', 'default'),
      GM.getValue('lyrics_scroll_speed', 'normal'),
      GM.getValue('lyrics_custom_width', null),
      GM.getValue('lyrics_custom_height', null)
    ]).then(([savedTheme, savedScrollSpeed, savedWidth, savedHeight]) => {
      currentTheme = savedTheme;
      currentScrollSpeed = savedScrollSpeed;
      customWidth = savedWidth;
      customHeight = savedHeight;
      
      // Apply theme to document immediately
      if (document.documentElement) {
        document.documentElement.setAttribute('data-lyrics-theme', currentTheme);
      }
    });

    // should it be required for robots.txt as well?? can remove??
    genius = geniusLyrics({
      GM,
      scriptName: SCRIPT_NAME,
      scriptIssuesURL: 'https://github.com/cvzi/Youtube-Genius-Lyrics-userscript/issues',
      scriptIssuesTitle: 'Report problem: github.com/cvzi/Youtube-Genius-Lyrics-userscript/issues',
      domain: 'https://www.youtube.com/',
      emptyURL: 'https://www.youtube.com/robots.txt',
      main,
      setupMain,
      addCss,
      getHitOfElement,
      listSongs,
      showSearchField,
      setupLyricsDisplayDOM,
      addLyrics,
      hideLyrics,
      getCleanLyricsContainer,
      setFrameDimensions,
      onResize,
      createSpinner,
      customSpinnerDOM,
      iframeLoadedCallback1,
      iframeLoadedCallback2,
      autoSelectLyrics,
      defaultOptions
    })

    if (isRobotsTxt !== false || genius === null || !genius.option) return
    GM.registerMenuCommand(SCRIPT_NAME + ' - Show lyrics', () => addLyrics(true))
    GM.registerMenuCommand(SCRIPT_NAME + ' - Reset custom settings', resetCustomSettings)
    
    // Function to reset custom settings
    function resetCustomSettings() {
      currentTheme = 'default';
      currentScrollSpeed = 'normal';
      customWidth = null;
      customHeight = null;
      
      // Save the default values
      GM.setValue('lyrics_theme', currentTheme);
      GM.setValue('lyrics_scroll_speed', currentScrollSpeed);
      GM.setValue('lyrics_custom_width', null);
      GM.setValue('lyrics_custom_height', null);
      
      // Apply theme to document
      document.documentElement.setAttribute('data-lyrics-theme', currentTheme);
      
      // Update selectors if they exist
      const themeSelector = document.querySelector('.lyrics-theme-selector');
      if (themeSelector) themeSelector.value = currentTheme;
      
      const speedSelector = document.querySelector('.lyrics-speed-selector');
      if (speedSelector) speedSelector.value = currentScrollSpeed;
      
      // Reset container size if it exists
      const container = document.getElementById('lyricscontainer');
      if (container) {
        container.style.width = '';
        container.style.height = '';
      }
      
      // Notify user
      const notification = document.createElement('div');
      notification.textContent = 'Custom settings reset to defaults';
      notification.style = 'position:fixed;top:60px;right:10px;background:#ffff64;color:#000;padding:10px;border-radius:4px;z-index:9999;box-shadow:0 2px 10px rgba(0,0,0,0.2);';
      document.body.appendChild(notification);
      setTimeout(() => notification.remove(), 3000);
    }

    function videoTimeUpdate (ev) {
      if (genius.f.isScrollLyricsCallable()) {
        if ((ev || 0).target.nodeName === 'VIDEO') updateAutoScroll()
      }
    }
    document.addEventListener('genius-lyrics-actor', (ev) => {
      const detail = ((ev || 0).detail || 0)
      const action = detail.action || ''
      if (action === 'hideLyrics') {
        hideLyricsWithMessageAndStopAutoShow()
      } else if (action === 'showLyrics') {
        showLyricsButtonClicked()
      } else if (action === 'reloadCurrentLyrics') {
        genius.f.reloadCurrentLyrics()
      } else if (action === 'forgetCurrentLyricsSelection') {
        genius.f.forgetCurrentLyricsSelection()
      } else if (action === 'setOption' && typeof detail.prop === 'string' && 'value' in detail) {
        genius.option[detail.prop] = detail.value
      }
    })
    window.addEventListener('message', function (e) {
      const data = ((e || 0).data || 0)
      if (data.iAm === SCRIPT_NAME && data.type === 'lyricsDisplayState') {
        let isScrollLyricsEnabled = false
        if (data.visibility !== 'loading') {
          const c = document.querySelector('#lyricscontainer.youtube-genius-lyrics-loading-container')
          if (c) {
            c.classList.remove('youtube-genius-lyrics-loading-container')
            if (data.visibility === 'loaded') {
              c.classList.add('youtube-genius-lyrics-found-container')
              document.documentElement.setAttribute('youtube-genius-lyrics-container', 'found')
              if (genius.current.compoundTitle) {
                window.lastFetchedQuery = `${genius.current.compoundTitle.replace('\t', ' ')}`
              }
            } else {
              document.documentElement.removeAttribute('youtube-genius-lyrics-container') // ???
            }
          }
        } else {
          window.lastFetchedQuery = null
        }
        if (data.visibility === 'loaded' && data.lyricsSuccess === true) {
          isScrollLyricsEnabled = genius.f.isScrollLyricsEnabled()
          // 'lyricsDisplayState:loaded' is after isPageAbleForAutoScroll setup in 'iframeContentRendered'
          if (genius.f.isScrollLyricsCallable()) {
            // update scroll position when the iframe is rendered
            updateAutoScroll(null, true)
          }
        }
        lyricsDisplayState = data.visibility
        if (isScrollLyricsEnabled === true) {
          document.addEventListener('timeupdate', videoTimeUpdate, true)
        } else {
          document.removeEventListener('timeupdate', videoTimeUpdate, true)
        }
      }
    })

    function isVideoPlaying (video) {
      return video.currentTime > 0 && !video.paused && !video.ended && video.readyState > video.HAVE_CURRENT_DATA
    }
    document.addEventListener('play', function (ev) {
      const statusCheck = () => isTriggered && lyricsDisplayState === 'hidden' && ((genius || 0).option || 0).autoShow
      if (!statusCheck()) return
      let video = ((ev || 0).target || 0)
      if (video.nodeName === 'VIDEO' && video.matches('#movie_player video[src]')) {
        const mPageLoadId = pageLoadId
        requestAnimationFrame(() => {
          if (mPageLoadId !== pageLoadId) {
            video = null
            return
          }
          setTimeout(() => {
            if (mPageLoadId === pageLoadId) {
              statusCheck() && isVideoPlaying(video) && actionAddLyricsOrButton()
            }
            video = null
          }, 600)
        })
      }
    }, true)

    function autoscrollenabledChanged () {
      // when value is configurated in any tab, this function will be triggered in all tabs by Userscript Manager
      requestAnimationFrame(() => {
        // not execute for all foreground and background tabs, only execute when the tab is visibile / when the tab shows
        genius.f.updateAutoScrollEnabled().then(() => {
          let isScrollLyricsEnabled = false
          if (lyricsDisplayState === 'loaded') {
            isScrollLyricsEnabled = genius.f.isScrollLyricsEnabled()
          }
          if (isScrollLyricsEnabled === true) {
            document.addEventListener('timeupdate', videoTimeUpdate, true)
          } else {
            document.removeEventListener('timeupdate', videoTimeUpdate, true)
          }
        })
      })
    }

    if (typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener('autoscrollenabled', autoscrollenabledChanged)
      
      // Listen for theme changes from other tabs
      GM_addValueChangeListener('lyrics_theme', function(name, old_value, new_value, remote) {
        if (remote && new_value !== currentTheme) {
          currentTheme = new_value;
          document.documentElement.setAttribute('data-lyrics-theme', currentTheme);
          
          // Update selector if it exists
          const themeSelector = document.querySelector('.lyrics-theme-selector');
          if (themeSelector) themeSelector.value = currentTheme;
        }
      });
      
      // Listen for scroll speed changes from other tabs
      GM_addValueChangeListener('lyrics_scroll_speed', function(name, old_value, new_value, remote) {
        if (remote && new_value !== currentScrollSpeed) {
          currentScrollSpeed = new_value;
          
          // Update selector if it exists
          const speedSelector = document.querySelector('.lyrics-speed-selector');
          if (speedSelector) speedSelector.value = currentScrollSpeed;
        }
      });
      
      // Listen for custom size changes from other tabs
      GM_addValueChangeListener('lyrics_custom_width', function(name, old_value, new_value, remote) {
        if (remote) {
          customWidth = new_value;
          
          // Update container if it exists
          const container = document.getElementById('lyricscontainer');
          if (container) {
            if (customWidth) {
              container.style.width = customWidth + 'px';
            } else {
              container.style.width = '';
            }
          }
        }
      });
      
      GM_addValueChangeListener('lyrics_custom_height', function(name, old_value, new_value, remote) {
        if (remote) {
          customHeight = new_value;
          
          // Update container if it exists
          const container = document.getElementById('lyricscontainer');
          if (container) {
            if (customHeight) {
              container.style.height = customHeight + 'px';
            } else {
              container.style.height = '';
            }
          }
        }
      });
    }

    function styleIframeContent () {
      if (genius.option.themeKey === 'genius' || genius.option.themeKey === 'geniusReact') {
        genius.style.enabled = true
        genius.style.setup = () => {
          genius.style.setup = null // run once; set variables to genius.styleProps

          if (genius.option.themeKey !== 'genius' && genius.option.themeKey !== 'geniusReact') return false

          const ytdApp = document.querySelector('ytd-app')
          if (!ytdApp) return

          const cStyle = window.getComputedStyle(ytdApp)
          let background = cStyle.getPropertyValue('--yt-spec-base-background')
          let color = cStyle.getPropertyValue('--yt-spec-text-primary')
          // let bbp = cStyle.getPropertyValue('--yt-spec-brand-background-primary')
          // let cfs = cStyle.getPropertyValue('--yt-caption-font-size')
          let slbc = cStyle.getPropertyValue('--ytd-searchbox-legacy-button-color')
          const linkColor = cStyle.getPropertyValue('--yt-spec-call-to-action') || ''
          const annotatedSpanBgColor = cStyle.getPropertyValue('--yt-live-chat-automod-button-background-color') || ''
          const annotatedSpanBgColorActive = cStyle.getPropertyValue('--yt-live-chat-automod-button-background-color-hover') || ''

          let fontSize = genius.option.fontSize
          if (genius.option.fontSize) {
            fontSize = `${genius.option.fontSize}px`
          } else {
            const expander = document.querySelector('ytd-expander')
            const menuItem = document.querySelector('ytd-guide-entry-renderer yt-formatted-string')
            if (expander) {
              fontSize = window.getComputedStyle(expander).fontSize
            } else if (menuItem) {
              fontSize = window.getComputedStyle(menuItem).fontSize
            } else {
              fontSize = cStyle.fontSize
            }
          }

          if (typeof background === 'string' && typeof color === 'string' && background.length > 3 && color.length > 3) {
            // do nothing
          } else {
            background = null
            color = null
          }

          if (typeof fontSize === 'string' && fontSize.length > 2) {
            // do nothing
          } else {
            fontSize = null
          }
          if (typeof slbc === 'string') {
            // do nothing
          } else {
            slbc = null
          }

          Object.assign(genius.styleProps, {
            '--egl-background': (background === null ? '' : `${background}`),
            '--egl-color': (color === null ? '' : `${color}`),
            '--egl-font-size': (fontSize === null ? '' : `${fontSize}`),
            '--egl-infobox-background': (slbc === null ? '' : `${slbc}`),
            '--egl-link-color': (`${linkColor}`),
            '--egl-annotated-span-bgcolor': (`${annotatedSpanBgColor}`),
            '--egl-annotated-span-bgcolor-active': (`${annotatedSpanBgColorActive}`)
          })
          return true
        }
      } else {
        genius.style.enabled = false
        genius.style.setup = null
      }
    }

    genius.onThemeChanged.push(styleIframeContent)

    Object.assign(genius.minimizeHit, {
      noImageURL: true,
      noFeaturedArtists: true,
      simpleReleaseDate: true,
      noRawReleaseDate: true,
      shortenArtistName: true,
      fixArtistName: true,
      removeStats: false,
      noRelatedLinks: true,
      onlyCompleteLyrics: false
    })
    genius.option.enableStyleSubstitution = true
    genius.option.normalizeClassV2 = true
    genius.option.cacheHTMLRequest = true // 1 lyrics page consume 2XX KB [OR 25 ~ 50KB under ]

    // prepare the shared options for the iframe
    try {
      const defaultOptions = Object.fromEntries(Object.entries(genius.option).filter(e => typeof e[1] === 'boolean'))
      sessionStorage[`geniusOptions_${SCRIPT_NAME}`] = JSON.stringify(defaultOptions)
    } catch (e) { }
    document.documentElement.classList.add('youtube-genius-lyrics')
  }
}
entryPoint()
