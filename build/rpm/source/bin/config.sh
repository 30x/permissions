#!/usr/bin/env bash

# Database Settings
export PG_HOST="{T}bin_config_pg_host{/T}"
export PG_USER="{T}bin_config_pg_user{/T}"
export PG_PASSWORD="{T}bin_config_pg_password{/T}"
export PG_DATABASE="{T}bin_config_pg_database{/T}"

# General Permissions Properties
export IPADDRESS="{T}bin_config_ip_address{/T}"
export PORT="{T}bin_config_ip_port{/T}"
export SPEEDUP="{T}bin_config_speedup{/T}"
export INTERNAL_SY_ROUTER_HOST="{T}bin_config_internal_sy_router_host{/T}"
export INTERNAL_SY_ROUTER_PORT="{T}bin_config_internal_sy_router_port{/T}"
export CACHE_SWEEP_INTERVAL="{T}bin_config_cache_sweep_interval{/T}" # (will be divided by SPEEDUP)
export CACHE_ENTRY_TTL="{T}bin_config_cache_entry_ttl{/T}" # (will be divided by SPEEDUP)

# Configuration for permissions-migration
export PERMISSIONS_CLIENTID="{T}bin_config_permissions_clientid{/T}"
export PERMISSIONS_CLIENTSECRET="{T}bin_config_permissions_clientsecret{/T}"
export EDGE_ADDRESS="{T}bin_config_edge_address{/T}"
export CLIENT_TOKEN_ISSUER="{T}bin_config_client_token_issuer{/T}"




