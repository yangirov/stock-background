-- Run from the repository root: lua obs/test_autostart.lua
local activated, initial_check, disconnected, released
local commands = {}
local now = 100
local active = false
package.preload.ffi = function()
    return {cdef = function() end, C = {getpid = function() return 123 end}}
end
obslua = {
    obs_data_get_string = function(settings, key) return settings[key] end,
    obs_get_signal_handler = function() return {} end,
    signal_handler_connect = function(_, signal, callback)
        assert(signal == 'source_activate')
        activated = callback
    end,
    signal_handler_disconnect = function() disconnected = true end,
    timer_add = function(callback) initial_check = callback end,
    timer_remove = function() end,
    calldata_source = function(source) return source end,
    obs_source_get_name = function(source) return source.name end,
    obs_get_source_by_name = function() return {} end,
    obs_source_active = function() return active end,
    obs_source_release = function() released = true end,
}
script_path = function() return '/test/obs/' end
os.execute = function(command) commands[#commands + 1] = command end
os.time = function() return now end
dofile('obs/stock-autostart.lua')
script_load({source_name = 'Акции', project = "/test/it's stocks", node_bin = '/node/bin'})
initial_check()
assert(released and #commands == 0, 'An inactive source must not start npm')
activated({name = 'Other'})
assert(#commands == 0, 'Other sources must not start npm')
activated({name = 'Акции'})
assert(#commands == 1, 'Showing stocks must start npm')
assert(commands[1]:find("'\\''", 1, true), 'Paths must be shell-quoted')
assert(commands[1]:find('--owner-pid 123', 1, true))
activated({name = 'Акции'})
assert(#commands == 1, 'Repeated immediate signals must be throttled')
now = 105
active = true
initial_check()
assert(#commands == 2, 'An already-visible source must start npm on load')
script_unload()
assert(disconnected)
print('OBS activation tests passed')
