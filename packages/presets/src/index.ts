/**
 * @smart-canvas/presets — built-in size presets (print + social), seeded into the presets table
 * (team_id null) on every migrate. Teams add their own presets on top (admins, T4.8).
 *
 * Sizes checked 2026-10 against current platform guides (DECISIONS O1). Where guides disagreed
 * (X post, profile images, LinkedIn page cover) only the commonly recommended size is listed.
 * Print sizes are ISO 216 / US standard trims; print presets carry 300 dpi and 3 mm bleed (O2).
 * Ids are fixed UUIDs so re-seeding updates rows in place. N5: `family` puts a size in a Preset node family
 * (e.g. the 7 GDN sizes are added together).
 */
import type { SizePreset } from '@smart-canvas/core';

export const presets: readonly SizePreset[] = [
  // Campaign set (owner, 2026-10-22): Facebook, Instagram, Google Display Network, app banners, website, gift, PR.
  { id: '9d19df09-3cae-57f0-a4d9-d7bcd03fa75e', teamId: null, group: 'social', name: 'FB 2400×2400', family: 'FB', size: { width: 2400, height: 2400, unit: 'px' } },
  { id: '59a45433-2fac-5006-a86c-a161af6312d6', teamId: null, group: 'social', name: 'IG 2400×3000', family: 'IG', size: { width: 2400, height: 3000, unit: 'px' } },
  { id: '84b2b24f-d8bf-5dae-bede-4b0516c90706', teamId: null, group: 'social', name: 'Story 1080×1920', family: 'Story', size: { width: 1080, height: 1920, unit: 'px' } },
  { id: '1f1ac5ca-59c7-52f2-9892-6e913cbeeb58', teamId: null, group: 'social', name: 'GDN 1200×628', family: 'GDN', size: { width: 1200, height: 628, unit: 'px' } },
  { id: '296e9ae8-dff0-51d6-95f9-dbf1016b3e8a', teamId: null, group: 'social', name: 'GDN 1200×200', family: 'GDN', size: { width: 1200, height: 200, unit: 'px' } },
  { id: 'f477f6ef-8757-5840-b4be-0e3ea0858799', teamId: null, group: 'social', name: 'GDN 900×1600', family: 'GDN', size: { width: 900, height: 1600, unit: 'px' } },
  { id: '68b2f0fe-a996-5134-a29e-57446c7f9c55', teamId: null, group: 'social', name: 'GDN 300×250', family: 'GDN', size: { width: 300, height: 250, unit: 'px' } },
  { id: 'df7bf35d-bee9-57cb-8946-373740cb6cd0', teamId: null, group: 'social', name: 'GDN 320×100', family: 'GDN', size: { width: 320, height: 100, unit: 'px' } },
  { id: '20f6cedb-9508-5113-ad2e-25c3c30b9371', teamId: null, group: 'social', name: 'GDN 440×140', family: 'GDN', size: { width: 440, height: 140, unit: 'px' } },
  { id: '7c20c2c7-892f-584c-b920-c5db28fdb1b5', teamId: null, group: 'social', name: 'GDN 728×90', family: 'GDN', size: { width: 728, height: 90, unit: 'px' } },
  { id: '82574b03-e289-53e2-a9cc-354d4c1fa614', teamId: null, group: 'social', name: 'App banner 1020×396', family: 'App banner', size: { width: 1020, height: 396, unit: 'px' } },
  { id: '92810c45-5027-523b-9200-ffe9b8a764e8', teamId: null, group: 'social', name: 'App banner 1080×2340', family: 'App banner', size: { width: 1080, height: 2340, unit: 'px' } },
  { id: 'ddb5b286-93b5-5df3-9600-5be08323f5a4', teamId: null, group: 'social', name: 'Website 1600×385', family: 'Website', size: { width: 1600, height: 385, unit: 'px' } },
  { id: '187d74c2-8bee-552a-9077-4a51822e942b', teamId: null, group: 'social', name: 'Website 639×220', family: 'Website', size: { width: 639, height: 220, unit: 'px' } },
  { id: 'd16b6bb3-732a-59ec-9613-64febe14a701', teamId: null, group: 'social', name: 'Website 450×307', family: 'Website', size: { width: 450, height: 307, unit: 'px' } },
  { id: '10216b3c-2607-5536-84ae-17e07d3e3dbc', teamId: null, group: 'social', name: 'Website 1200×200', family: 'Website', size: { width: 1200, height: 200, unit: 'px' } },
  { id: '4e52be81-d09d-55fe-8fcb-12c8ec671570', teamId: null, group: 'social', name: 'Gift 1500×400', family: 'Gift', size: { width: 1500, height: 400, unit: 'px' } },
  { id: 'bcdff900-7988-599e-a591-bb749b1806b7', teamId: null, group: 'social', name: 'PR 1660×930', family: 'PR', size: { width: 1660, height: 930, unit: 'px' } },
  { id: 'dceae35b-534b-5a73-9b1c-af83fb21a46a', teamId: null, group: 'social', name: 'Instagram portrait 4:5', size: { width: 1080, height: 1350, unit: 'px' } },
  { id: '206703bf-5b03-5e19-bd0d-b47c319e4183', teamId: null, group: 'social', name: 'Instagram square', size: { width: 1080, height: 1080, unit: 'px' } },
  { id: '2713dea2-00fa-5318-a21c-6e1aef462299', teamId: null, group: 'social', name: 'Story / Reel / TikTok 9:16', size: { width: 1080, height: 1920, unit: 'px' } },
  { id: 'e4ab6c1a-0d54-5c8f-93c9-21cebd994bab', teamId: null, group: 'social', name: 'Facebook link post', size: { width: 1200, height: 630, unit: 'px' } },
  { id: '74a76af4-baee-5e4d-8962-d3d3b7d27ae1', teamId: null, group: 'social', name: 'Facebook Page cover', size: { width: 851, height: 315, unit: 'px' } },
  { id: 'e721b700-53ad-5212-b3dd-5be34d6a2a3f', teamId: null, group: 'social', name: 'X post 16:9', size: { width: 1600, height: 900, unit: 'px' } },
  { id: 'd6ea0545-aec4-5216-bdbf-38fb012b4d4b', teamId: null, group: 'social', name: 'X header', size: { width: 1500, height: 500, unit: 'px' } },
  { id: '2229a28d-7a0d-5a90-b5c0-2c8db0c96880', teamId: null, group: 'social', name: 'LinkedIn post', size: { width: 1200, height: 627, unit: 'px' } },
  { id: '39611ec6-b2d2-578d-a88e-389fcb362c4b', teamId: null, group: 'social', name: 'LinkedIn banner', size: { width: 1584, height: 396, unit: 'px' } },
  { id: '4b34e786-ff63-5b14-902b-c07ed7f812db', teamId: null, group: 'social', name: 'YouTube thumbnail', size: { width: 1280, height: 720, unit: 'px' } },
  { id: '5dff8b1d-b850-5c51-84b4-9677226c5e8a', teamId: null, group: 'social', name: 'YouTube channel art', size: { width: 2560, height: 1440, unit: 'px' } },
  { id: '55008495-c3e1-5fec-86f8-e2ad8a4e5bdb', teamId: null, group: 'social', name: 'Pinterest pin 2:3', size: { width: 1000, height: 1500, unit: 'px' } },
  { id: '4e386ab5-af9a-5ae1-a283-b4003c41ebee', teamId: null, group: 'print', name: 'A1 poster', size: { width: 594, height: 841, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: 'd591c3cf-a7cd-5aa7-8d86-57d2e7a96285', teamId: null, group: 'print', name: 'A2 poster', size: { width: 420, height: 594, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: '71ff9526-4962-58e5-b3ad-bab78acf7632', teamId: null, group: 'print', name: 'A3', size: { width: 297, height: 420, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: '707f23df-d0d9-583d-bbc8-15bbc69d5187', teamId: null, group: 'print', name: 'A4', size: { width: 210, height: 297, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: '2e61991a-09d5-5362-a6d2-3abe875b54e1', teamId: null, group: 'print', name: 'A5 flyer', size: { width: 148, height: 210, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: 'bd3759bf-e4f4-5c31-ac12-d79bbc052404', teamId: null, group: 'print', name: 'A6 postcard', size: { width: 105, height: 148, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: '6de2479d-ff87-59f3-9572-67cbf27bb8b1', teamId: null, group: 'print', name: 'US Letter', size: { width: 215.9, height: 279.4, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: 'cf35ce19-115b-50ee-8d4f-ba41e0f355d4', teamId: null, group: 'print', name: 'DL flyer', size: { width: 99, height: 210, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: '72149558-5e2e-5a2f-87a3-0d17742fd76a', teamId: null, group: 'print', name: 'Business card', size: { width: 85, height: 55, unit: 'mm' }, dpi: 300, bleedMm: 3 },
  { id: '7fe135f5-7c62-5d9a-947b-851aa55085e5', teamId: null, group: 'print', name: 'US business card', size: { width: 88.9, height: 50.8, unit: 'mm' }, dpi: 300, bleedMm: 3 },
];
