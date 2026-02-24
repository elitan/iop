# macos db branching todo

## goal
- local on mac
- same mental model as linux
- no fallback mode changes

## decision criteria
- one consistent engine path
- cow clone speed
- safe postgres semantics
- can run frost tests locally
- low ops burden

## angles and tests
- [x] linux zfs inside docker desktop kernel
- result: no zfs module in docker desktop vm

- [x] apfs clone cow behavior
- result: `cp -cR` and `COPYFILE_FICLONE_FORCE` are instant and isolated

- [x] postgres branch create/reset using apfs clone
- result: works; measured ~1.1s to ~1.3s pause windows in local runs

- [x] online clone stress without stop/start
- result: 30/30 boots under write load; still marked risky by postgres backup rules

- [x] btrfs cow in privileged linux container
- result: subvolume snapshot works in docker desktop linux kernel

- [x] btrfs + postgres online snapshot behavior
- result:
  - without cleanup: clone start fails due copied `postmaster.pid`
  - with `postmaster.pid` cleanup: clone starts and recovers

- [x] btrfs + postgres safe branch stress (checkpoint + stop + snapshot + start)
- result:
  - 20/20 branch cycles passed
  - avg source pause: ~233ms
  - reset semantics passed (`reset_marker_after_reset=0`)

- [x] btrfs + postgres long churn stress
- result:
  - 100/100 branch cycles passed
  - avg source pause: ~252ms

- [x] firecracker host viability on mac docker path
- result: no `/dev/kvm`; firecracker not viable directly on mac host path

- [ ] neon architecture as alternative
- task: map timeline/pageserver model to frost scope and complexity
- notes:
  - cloned at `/Users/johan/code/elitan/frost/neon-source`
  - local run path exists on mac but stack is heavy (pageserver + safekeeper + broker + compute)
  - rough size signal: pageserver_files=188, safekeeper_files=81, compute_files=235, rust_workspace_crates=37

- [ ] vm substrate options
- task: lima/vz vs qemu vs custom vm runtime
- notes:
  - firecracker requires linux host + kvm
  - cloud-hypervisor runs on top of kvm (linux) or mshv (windows)
  - lima supports vmType `qemu` and `vz` on mac

- [x] qcow2 cow overlays for vm branch disks
- result: overlay create is instant (`real 0.01`) with backing file chain

- [ ] choose single engine for mac dev + linux prod parity
- task: commit to one path, reject others
