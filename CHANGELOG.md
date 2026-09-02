# [1.15.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.14.0...v1.15.0) (2026-09-02)


### Features

* add update_recipe_ingredients_batch for bounded-concurrency ingredient writes ([#22](https://github.com/timo-reymann/mealie-mcp-server/issues/22)) ([1cf5074](https://github.com/timo-reymann/mealie-mcp-server/commit/1cf50748e6de7a9e3c14211cbad918f45d06a5b4))

# [1.14.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.13.0...v1.14.0) (2026-09-02)


### Bug Fixes

* verify structured ingredient writes against Mealie's persisted response ([#23](https://github.com/timo-reymann/mealie-mcp-server/issues/23)) ([1f794d1](https://github.com/timo-reymann/mealie-mcp-server/commit/1f794d11b35e53a9c6bfd7d70b2bb0b3e3db0206)), closes [mealie-recipes/mealie#7139](https://github.com/mealie-recipes/mealie/issues/7139)


### Features

* publish server-level MCP instructions for cross-tool guidance ([#21](https://github.com/timo-reymann/mealie-mcp-server/issues/21)) ([bda5875](https://github.com/timo-reymann/mealie-mcp-server/commit/bda5875b5d6ccc2e77f818e73b4d7506a71155a6))

# [1.13.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.12.0...v1.13.0) (2026-08-26)


### Features

* [[#18](https://github.com/timo-reymann/mealie-mcp-server/issues/18)] add patch_mealplan tool for batch meal plan operations ([#20](https://github.com/timo-reymann/mealie-mcp-server/issues/20)) ([e9e6e96](https://github.com/timo-reymann/mealie-mcp-server/commit/e9e6e966d2b80e1a9223b518712bc9c8f78e7556))

# [1.12.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.11.0...v1.12.0) (2026-08-26)


### Features

* auto-generate API_COVERAGE.md and README tool list from source ([#19](https://github.com/timo-reymann/mealie-mcp-server/issues/19)) ([0efdded](https://github.com/timo-reymann/mealie-mcp-server/commit/0efddedeebe433fe3da4419f21045d32731d537d))

# [1.11.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.10.0...v1.11.0) (2026-08-26)


### Features

* auto-generate API_COVERAGE.md and README tool list from source ([a309d90](https://github.com/timo-reymann/mealie-mcp-server/commit/a309d9030bb5de2d431dca4ec4d0cac54eb55a68))

# [1.10.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.9.0...v1.10.0) (2026-08-26)


### Features

* add get_recipes_for_ingredient_parsing tool ([#17](https://github.com/timo-reymann/mealie-mcp-server/issues/17)) ([24e3672](https://github.com/timo-reymann/mealie-mcp-server/commit/24e3672d67f066ec7487b46dfac4d3b2f9078527))
* add unit CRUD tools (get_units, get_unit, create_unit, update_unit, delete_unit) ([#15](https://github.com/timo-reymann/mealie-mcp-server/issues/15)) ([eecdd6c](https://github.com/timo-reymann/mealie-mcp-server/commit/eecdd6c1eecbad1ea77d3371502521d28ec4d385))

# [1.9.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.8.0...v1.9.0) (2026-08-20)


### Features

* add update_recipe_ingredients tool ([#13](https://github.com/timo-reymann/mealie-mcp-server/issues/13)) ([04cb46f](https://github.com/timo-reymann/mealie-mcp-server/commit/04cb46f080783976cd3486527dee5818a14550e9))

# [1.8.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.7.0...v1.8.0) (2026-08-20)


### Bug Fixes

* update_food sending id: null, violating Mealie's NOT NULL constraint ([209e8c9](https://github.com/timo-reymann/mealie-mcp-server/commit/209e8c9e7a8cba4fcea16db61018865203b8b830))


### Features

* add food CRUD tools (get_foods, get_food, create_food, update_food, delete_food) ([d45a1d9](https://github.com/timo-reymann/mealie-mcp-server/commit/d45a1d921fb2c30c90a766ee42fd651f36326131))

# [1.7.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.6.0...v1.7.0) (2026-08-19)


### Features

* add get_recipes_for_classification tool ([#11](https://github.com/timo-reymann/mealie-mcp-server/issues/11)) ([9ec058d](https://github.com/timo-reymann/mealie-mcp-server/commit/9ec058df287e7fce8c24aeb2e7417ee7e1258e1b)), closes [server#tool](https://github.com/server/issues/tool)

# [1.6.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.5.3...v1.6.0) (2026-08-18)


### Features

* add find_recipes_for_ingredients tool ([#8](https://github.com/timo-reymann/mealie-mcp-server/issues/8)) ([06135d6](https://github.com/timo-reymann/mealie-mcp-server/commit/06135d6536520980d4c1809da30f5ab11af442bd)), closes [#9](https://github.com/timo-reymann/mealie-mcp-server/issues/9)

## [1.5.3](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.5.2...v1.5.3) (2026-08-18)


### Bug Fixes

* get_recipes silently ignoring non-slug category/tag filters ([#9](https://github.com/timo-reymann/mealie-mcp-server/issues/9)) ([4e111df](https://github.com/timo-reymann/mealie-mcp-server/commit/4e111df944590f6e102bb5876b8e1ddc0503610d))

## [1.5.2](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.5.1...v1.5.2) (2026-08-18)


### Bug Fixes

* get_recipes ignoring multi-value categories/tags filters ([#7](https://github.com/timo-reymann/mealie-mcp-server/issues/7)) ([07f53ff](https://github.com/timo-reymann/mealie-mcp-server/commit/07f53ff4508f59c288d7d44814dc27b124588877))

## [1.5.1](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.5.0...v1.5.1) (2026-08-18)


### Bug Fixes

* getRecipesBatch firing every request at once causes gateway timeouts ([#10](https://github.com/timo-reymann/mealie-mcp-server/issues/10)) ([d9fc185](https://github.com/timo-reymann/mealie-mcp-server/commit/d9fc185fbd6894256b6b53956f1f2db6c5d16dd0))

# [1.5.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.4.1...v1.5.0) (2026-08-17)


### Features

* assign categories and tags to existing recipes ([#5](https://github.com/timo-reymann/mealie-mcp-server/issues/5)) ([c719148](https://github.com/timo-reymann/mealie-mcp-server/commit/c719148cef15d9c87b8d5607c50f57ff02f98062))

## [1.4.1](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.4.0...v1.4.1) (2026-08-16)


### Bug Fixes

* create_recipe ignoring ingredients and instructions ([#4](https://github.com/timo-reymann/mealie-mcp-server/issues/4)) ([ca2d5ff](https://github.com/timo-reymann/mealie-mcp-server/commit/ca2d5ffb6ab36fd46bf84759854bf08beed19d19))

# [1.4.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.3.0...v1.4.0) (2026-07-15)


### Features

* add new_release_version as explicit Docker tag ([48f087a](https://github.com/timo-reymann/mealie-mcp-server/commit/48f087a4439a5731f29befdbe16f11dc2d376158)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)

# [1.3.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.2.1...v1.3.0) (2026-07-15)


### Features

* use semantic-release-action with conditional Docker build ([4be2dd9](https://github.com/timo-reymann/mealie-mcp-server/commit/4be2dd9b12ae492a1ea46cdb1557e72038ed24cd)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)

## [1.2.1](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.2.0...v1.2.1) (2026-07-15)


### Bug Fixes

* use workflow_run to trigger Docker after CI completes ([21bb1eb](https://github.com/timo-reymann/mealie-mcp-server/commit/21bb1ebdc0a343f1d583944a5b27fabdc3ef36f8)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)

# [1.2.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.1.1...v1.2.0) (2026-07-15)


### Bug Fixes

* add id-token write permission for docker job on tag pushes ([6c9d4db](https://github.com/timo-reymann/mealie-mcp-server/commit/6c9d4db11709ccc95775b7e378dd91d3c95ae998)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)
* run docker job independently on main and tag pushes ([78c2b3e](https://github.com/timo-reymann/mealie-mcp-server/commit/78c2b3e88f062e181db2fb84aab923152a57b000)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)


### Features

* add Docker build to CI workflow on release ([08f3fc9](https://github.com/timo-reymann/mealie-mcp-server/commit/08f3fc9597e79b730a367e4a30488c2263e97a81)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)

## [1.1.1](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.1.0...v1.1.1) (2026-07-15)


### Bug Fixes

* Fix skip ci ([a4bd0ad](https://github.com/timo-reymann/mealie-mcp-server/commit/a4bd0adbd3b6117f480bedc2ea3636a6a46133b3))

# [1.1.0](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.0.2...v1.1.0) (2026-07-15)


### Features

* add Docker support with GitHub Actions workflow ([#2](https://github.com/timo-reymann/mealie-mcp-server/issues/2)) ([8f75d9f](https://github.com/timo-reymann/mealie-mcp-server/commit/8f75d9f1844bcecd82a60ad9b21170574cc847bc)), closes [#1](https://github.com/timo-reymann/mealie-mcp-server/issues/1)

## [1.0.2](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.0.1...v1.0.2) (2026-06-20)


### Bug Fixes

* trigger release pipeline again ([ce56b67](https://github.com/timo-reymann/mealie-mcp-server/commit/ce56b67e715d20a1fd28dbb77a9baf7cc0840e6e))

## [1.0.1](https://github.com/timo-reymann/mealie-mcp-server/compare/v1.0.0...v1.0.1) (2026-06-20)


### Bug Fixes

* exclude test files from build output and set dev version ([3462c4d](https://github.com/timo-reymann/mealie-mcp-server/commit/3462c4d45db1e8c1e0cf606dd198f51dae20952b))
* include test files in ESLint project service ([a86915e](https://github.com/timo-reymann/mealie-mcp-server/commit/a86915e4e8d16ba582e983faf9e88a538928ec3b))
* trigger release pipeline ([623b491](https://github.com/timo-reymann/mealie-mcp-server/commit/623b491aee3271d62ec7e071f1bf13504a99a6af))

# 1.0.0 (2026-06-20)


### Features

* add category and tag API and tools ([adea469](https://github.com/timo-reymann/mealie-mcp-server/commit/adea469b549534aefbe5e7b7b66c1995e28f703d))
* add config validation and HTTP client ([4de671a](https://github.com/timo-reymann/mealie-mcp-server/commit/4de671a8c2a3e540fc04157de3554a7375417d38))
* add MCP server entry point with prompt ([8d14d37](https://github.com/timo-reymann/mealie-mcp-server/commit/8d14d37b508452cf3fccc2dcbf9d8f1ac0bd09db))
* add meal plan API and tools with composite endpoint ([8aec5dd](https://github.com/timo-reymann/mealie-mcp-server/commit/8aec5dd7a428a02383f136cdf7d0f13bc4f9a649))
* add recipe API and tools ([0abf024](https://github.com/timo-reymann/mealie-mcp-server/commit/0abf0243e92aa7af3ce2a7019445d82f4ec7e144))
* add shopping list API and tools ([f78bdf7](https://github.com/timo-reymann/mealie-mcp-server/commit/f78bdf708172ffae46a3574f1b03974078cd81f0))
